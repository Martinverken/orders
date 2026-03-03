import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from integrations.base import BaseIntegration, IntegrationError
from integrations.falabella.client import FalabellaClient
from integrations.mercadolibre.client import MercadoLibreClient
from repositories.order_repository import OrderRepository
from repositories.sync_log_repository import SyncLogRepository
from repositories.delayed_order_repository import DelayedOrderRepository
from models.sync_log import SyncLogCreate, SyncStatus, SyncResult
from models.order import Order, OrderCreate, OrderUrgency

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
_SANTIAGO_TZ = ZoneInfo("America/Santiago")


def _is_order_resolved(order: Order) -> bool:
    """Determina si el pedido llegó a un estado terminal desde nuestra perspectiva.

    Falabella Regular: 'shipped' = entregado al operador logístico de Falabella
                       → nuestra responsabilidad termina ahí.
    Falabella Direct:  nosotros entregamos → solo 'delivered' cuenta.

    ML Centro de Envíos (fulfillment): nosotros llevamos el paquete al centro ML
                       → shipment.status = 'ready_to_ship' o 'shipped' = resuelto.
    ML Flex (self_service): nosotros entregamos al cliente final
                       → shipment.status = 'delivered' = resuelto.

    Nota: el order.status de ML siempre es 'paid' mientras está activo.
    El estado relevante está en raw_data['shipment']['status'].
    """
    if order.source == "falabella":
        raw = order.raw_data or {}
        shipping_type = str(raw.get("ShippingProviderType", "")).lower()
        if "regular" in shipping_type:
            return order.status in ("shipped", "delivered")
        else:
            return order.status == "delivered"

    if order.source == "mercadolibre":
        raw = order.raw_data or {}
        shipment = raw.get("shipment") or {}
        logistic_type = str(shipment.get("logistic_type", "")).lower()
        shipment_status = str(shipment.get("status", "")).lower()
        if logistic_type == "fulfillment":
            # Centro de Envíos: llegó al centro ML → nuestra parte termina
            return shipment_status in ("ready_to_ship", "shipped", "delivered")
        else:
            # Flex u otro: nosotros entregamos → solo delivered
            return shipment_status == "delivered"

    return order.status in ("shipped", "delivered")


class SyncService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.sync_log_repo = SyncLogRepository()
        self.delayed_repo = DelayedOrderRepository()
        self.integrations: dict[str, BaseIntegration] = {
            "falabella": FalabellaClient(),
            "mercadolibre": MercadoLibreClient(),
        }

    async def run_full_sync(self) -> list[SyncResult]:
        results = []
        for source_name in self.integrations:
            result = await self.run_single_source(source_name)
            results.append(result)
        return results

    async def run_single_source(self, source: str) -> SyncResult:
        integration = self.integrations.get(source)
        if not integration:
            return SyncResult(source=source, error=f"Unknown source: {source}")

        log = self.sync_log_repo.create(SyncLogCreate(source=source))
        start_ms = int(time.time() * 1000)
        orders_fetched = 0
        orders_upserted = 0
        error_msg = None
        batch: list[OrderCreate] = []
        fetched_ids: set[str] = set()

        try:
            async for order in integration.fetch_pending_orders():
                batch.append(order)
                fetched_ids.add(order.external_id)
                orders_fetched += 1
                if len(batch) >= BATCH_SIZE:
                    orders_upserted += self.order_repo.upsert_batch(batch)
                    batch = []

            if batch:
                orders_upserted += self.order_repo.upsert_batch(batch)

            # Cleanup: process orders that disappeared from the API feed
            # Wrapped in try/except so a cleanup failure never breaks the sync
            try:
                self._cleanup_resolved(source, fetched_ids)
            except Exception as cleanup_err:
                logger.error(f"[{source}] Cleanup error (sync continues): {cleanup_err}")

            status = SyncStatus.SUCCESS
        except IntegrationError as e:
            error_msg = str(e)
            status = SyncStatus.ERROR
            logger.error(f"Sync failed for {source}: {e}")
        except Exception as e:
            error_msg = f"Unexpected error: {e}"
            status = SyncStatus.ERROR
            logger.exception(f"Unexpected sync error for {source}")

        duration_ms = int(time.time() * 1000) - start_ms
        self.sync_log_repo.update(
            log.id,
            status=status,
            orders_fetched=orders_fetched,
            orders_upserted=orders_upserted,
            error_message=error_msg,
        )

        return SyncResult(
            source=source,
            orders_fetched=orders_fetched,
            orders_upserted=orders_upserted,
            error=error_msg,
            duration_ms=duration_ms,
        )

    def _cleanup_resolved(self, source: str, fetched_ids: set[str]) -> None:
        """Archiva pedidos resueltos y los elimina de la tabla de activos.

        Lógica de clasificación:

        1. Si el pedido llegó a estado terminal (según _is_order_resolved):
           - urgency=OVERDUE → atrasado (estado terminal llegó después del plazo)
           - otro → a tiempo

        2. Si pasó la fecha límite y sigue activo (pending/ready_to_ship o
           shipped en Direct que aún no llega a delivered) → atrasado.

        3. Si desapareció del feed antes del plazo → a tiempo.

        Falabella Regular: shipped = terminal (lo tomó el carrier de Falabella).
        Falabella Direct:  shipped no es terminal, solo delivered cuenta.
        """
        now = datetime.now(_SANTIAGO_TZ)
        db_orders = self.order_repo.get_all_by_source(source)

        late, on_time = [], []
        for ext_id, order in db_orders.items():
            past_deadline = order.limit_delivery_date < now
            left_feed = ext_id not in fetched_ids

            if _is_order_resolved(order):
                # Estado terminal alcanzado — urgency guardada decide si fue a tiempo o tarde
                if order.urgency == OrderUrgency.OVERDUE:
                    late.append(order)
                else:
                    on_time.append(order)
            elif past_deadline:
                # Sigue activo después del plazo → atrasado
                late.append(order)
            elif left_feed:
                # Desapareció antes del plazo → resuelto temprano → a tiempo
                on_time.append(order)
            # else: activo, dentro del plazo → mantener

        if late:
            archived = self.delayed_repo.archive_batch(late, was_delayed=True)
            logger.info(f"[{source}] Archived {archived} late orders")

        if on_time:
            self.delayed_repo.archive_batch(on_time, was_delayed=False)
            logger.info(f"[{source}] Archived {len(on_time)} on-time orders")

        all_resolved = late + on_time
        if all_resolved:
            self.order_repo.delete_batch([o.id for o in all_resolved])
            logger.info(
                f"[{source}] Removed {len(late)} late + {len(on_time)} on-time orders"
            )
