import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.falabella.client import FalabellaClient
from integrations.falabella.mapper import parse_falabella_datetime
from integrations.mercadolibre.client import MercadoLibreClient
from integrations.mercadolibre.mapper import parse_ml_datetime
from integrations.shopify.client import ShopifyClient
from integrations.walmart.client import WalmartClient
from integrations.paris.client import ParisClient
from repositories.order_repository import OrderRepository
from repositories.sync_log_repository import SyncLogRepository
from repositories.delayed_order_repository import DelayedOrderRepository
from repositories.settings_repository import SettingsRepository
from models.sync_log import SyncLogCreate, SyncStatus, SyncResult
from models.order import Order, OrderCreate, OrderUrgency

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
_SANTIAGO_TZ = ZoneInfo("America/Santiago")


def _get_delivery_date(order: Order) -> datetime | None:
    """Extrae la fecha real de despacho/entrega desde raw_data.

    Falabella: order.first_shipped_at (DB trigger captura el primer UpdatedAt al pasar a 'shipped')
    ML Flex: shipment.status_history.date_delivered
    ML CE (xd_drop_off): substatus_history[dropped_off].date → acción del vendedor
    ML CE (otros): shipment.status_history.date_shipped
    """
    if order.source.startswith("shopify"):
        # DB trigger captures first transition to "delivered" (Welivery COMPLETADO)
        return order.first_delivered_at or order.first_shipped_at or None

    if order.source in ("falabella", "walmart", "paris"):
        # DB trigger captures first 'shipped' (Regular/Standard) and first 'delivered' (Direct) timestamps
        # immutably — prevents later UpdatedAt changes from affecting classification.
        if order.first_shipped_at:
            return order.first_shipped_at
        if order.first_delivered_at:
            return order.first_delivered_at
        # Fallback for rows pre-dating the trigger (Falabella only)
        if order.source == "falabella":
            raw = order.raw_data or {}
            items = raw.get("_items") or []
            first_item = items[0] if isinstance(items, list) and items else {}
            return parse_falabella_datetime(first_item.get("UpdatedAt"))
        return None

    if order.source == "mercadolibre":
        raw = order.raw_data or {}
        shipment = raw.get("shipment") or {}
        logistic_type = str(shipment.get("logistic_type", "")).lower()
        status_history = shipment.get("status_history") or {}
        if logistic_type == "self_service":
            raw_date = status_history.get("date_delivered")
        else:
            # CE orders: usar la fecha más temprana que representa acción del vendedor.
            # xd_drop_off → dropped_off substatus (vendedor suelta en punto ML)
            # cross_docking → date_ready_to_ship (vendedor dejó listo; date_shipped = carrier recoge, fuera del control del vendedor)
            substatus_history = shipment.get("substatus_history") or []
            dropped_off_date = next(
                (e.get("date") for e in substatus_history if e.get("substatus") == "dropped_off"),
                None,
            )
            raw_date = (
                dropped_off_date
                or status_history.get("date_ready_to_ship")
                or status_history.get("date_shipped")
            )
        return parse_ml_datetime(raw_date) if isinstance(raw_date, str) else None

    return None


def _get_handoff_date(order: Order) -> datetime | None:
    """Extract when warehouse actually handed off to carrier.

    For Regular/CE: same as delivery date (first_shipped_at).
    For Direct/Flex/Shopify: first_shipped_at = when carrier picked up from warehouse.
    """
    # first_shipped_at is set by DB trigger on first status change to 'shipped'
    return order.first_shipped_at


def _is_regular_shipping(order: Order) -> bool:
    """Check if order uses Regular/Centro Envíos (carrier picks up from warehouse).

    For these orders, shipped = terminal and any delay is always bodega's fault.
    """
    raw = order.raw_data or {}
    if order.source == "falabella":
        spt = (raw.get("ShippingProviderType") or "").strip().lower()
        return spt == "regular"
    if order.source in ("walmart", "paris"):
        return True  # Always carrier pickup
    if order.source == "mercadolibre":
        mode = (raw.get("delivery_mode") or "").lower()
        return mode not in ("flex", "self_service")
    if order.source.startswith("shopify"):
        return True  # Shopify: shipped (fulfilled) = Welivery picked up; terminal
    return True


def _compute_blame(
    order: Order,
    handoff_dt: datetime | None,
    delivery_dt: datetime | None,
) -> str | None:
    """Determine who is responsible for a delay.

    Returns 'bodega' if warehouse handed off after limit_handoff_date.
    Returns 'transportista' if handoff was on time but delivery was late.
    Returns None if order was on time or we can't determine.

    For Regular/Centro Envíos, blame is always 'bodega' since shipped = terminal
    and the seller only controls the handoff to carrier.
    """
    limit_handoff = order.limit_handoff_date or order.limit_delivery_date
    if not limit_handoff:
        return None

    # Regular/CE: any delay is bodega's fault (shipped = terminal)
    if _is_regular_shipping(order):
        if handoff_dt and handoff_dt > limit_handoff:
            return "bodega"
        if delivery_dt and delivery_dt > order.limit_delivery_date:
            return "bodega"
        return None

    # Check if warehouse was late
    if handoff_dt and handoff_dt > limit_handoff:
        return "bodega"

    # If handoff was on time (or unknown), check if delivery was late
    if delivery_dt and delivery_dt > order.limit_delivery_date:
        return "transportista"

    return None


def _falabella_was_late(order: Order) -> bool:
    date_val = _get_delivery_date(order)
    if date_val:
        return date_val > order.limit_delivery_date
    return order.urgency == OrderUrgency.OVERDUE


def _is_order_resolved(order: Order) -> bool:
    """Determina si el pedido salió del ámbito de seguimiento activo.

    - Regular/CE: shipped = terminal (carrier picked up, seller done)
    - Direct/Flex/Shopify: only delivered = terminal (seller delivers to client)
    - ML: check shipment.status for real delivery status
    """
    if order.source == "mercadolibre":
        raw = order.raw_data or {}
        shipment = raw.get("shipment") or {}
        shipment_status = str(shipment.get("status", "")).lower()
        if shipment_status == "delivered":
            return True
        # ML Regular (cross_docking, etc.): shipped = terminal
        if _is_regular_shipping(order) and order.status == "shipped":
            return True
        return False

    # Regular/CE: shipped = terminal
    if _is_regular_shipping(order) and order.status in ("shipped", "delivered"):
        return True

    return order.status == "delivered"


def _ml_was_late(order: Order) -> bool:
    raw = order.raw_data or {}
    shipment = raw.get("shipment") or {}
    logistic_type = str(shipment.get("logistic_type", "")).lower()

    effective_limit = order.limit_delivery_date
    if logistic_type == "self_service":
        # Excepción buyer_absent / buyer_rescheduled: si el conductor marcó cliente
        # ausente o el comprador reprogramó la entrega antes del plazo,
        # ML permite entregar al siguiente día hábil → extender el límite efectivo.
        _EXTEND_SUBSTATUSES = {"buyer_absent", "buyer_rescheduled"}
        substatus = str(shipment.get("substatus") or "")
        substatus_history = shipment.get("substatus_history") or []
        if substatus in _EXTEND_SUBSTATUSES or any(
            e.get("substatus") in _EXTEND_SUBSTATUSES for e in substatus_history
        ):
            from integrations.mercadolibre.mapper import _next_business_day_eod
            effective_limit = _next_business_day_eod(effective_limit)
            logger.info(
                f"[flex] {substatus} for {order.external_id} — "
                f"extending deadline to {effective_limit}"
            )

    date_val = _get_delivery_date(order)
    if date_val:
        return date_val > effective_limit
    # CE: usar first_shipped_at si disponible
    if logistic_type != "self_service":
        if order.first_shipped_at:
            return order.first_shipped_at > effective_limit
        return False  # No date available → benefit of the doubt
    # Flex: no delivery date in DB → fall back to stored urgency
    return order.urgency == OrderUrgency.OVERDUE


class SyncService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.sync_log_repo = SyncLogRepository()
        self.delayed_repo = DelayedOrderRepository()
        self.settings_repo = SettingsRepository()
        self.integrations: dict[str, BaseIntegration] = {
            "falabella": FalabellaClient(),
            "mercadolibre": MercadoLibreClient(),
        }
        settings = get_settings()
        # Walmart — optional, only if credentials are configured
        if settings.walmart_client_id and settings.walmart_client_secret:
            try:
                self.integrations["walmart"] = WalmartClient()
            except IntegrationError as e:
                logger.info(f"Walmart not configured: {e}")
        # Paris (Cencosud) — optional, only if credentials are configured
        if settings.paris_api_key:
            try:
                self.integrations["paris"] = ParisClient()
            except IntegrationError as e:
                logger.info(f"Paris not configured: {e}")
        _SHOPIFY_STORES = [
            ("shopify_verken", settings.shopify_verken_url, settings.shopify_verken_token),
            ("shopify_kaut",   settings.shopify_kaut_url,   settings.shopify_kaut_token),
        ]
        for source_name, url, token in _SHOPIFY_STORES:
            if url and token:
                try:
                    self.integrations[source_name] = ShopifyClient(url, token, source_name)
                except IntegrationError as e:
                    logger.info(f"Shopify store {source_name} not configured: {e}")

    async def run_full_sync(self) -> list[SyncResult]:
        results = []
        for source_name in self.integrations:
            result = await self.run_single_source(source_name)
            results.append(result)
        # Re-attempt comprobante fetch for Flex/Direct orders archived without one
        try:
            updated = self.delayed_repo.refresh_missing_comprobantes()
            if updated:
                logger.info(f"[comprobantes] Refreshed {updated} missing comprobantes")
        except Exception as e:
            logger.error(f"[comprobantes] Refresh error: {e}")
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
            # For ML: reload CE schedule from DB before fetching orders
            if source == "mercadolibre":
                try:
                    from integrations.mercadolibre.mapper import reload_ce_schedule
                    row = self.settings_repo.get("ml_ce_schedule")
                    if row and row.get("value"):
                        reload_ce_schedule(row["value"])
                except Exception as e:
                    logger.warning(f"[mercadolibre] Could not reload CE schedule: {e}")

            archived_ids = self.delayed_repo.get_archived_external_ids(source)

            async for order in integration.fetch_pending_orders():
                fetched_ids.add(order.external_id)
                orders_fetched += 1
                if order.external_id in archived_ids:
                    continue  # already archived — skip re-insertion
                batch.append(order)
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

            # For ML: re-check archived CE orders that may now be delivered
            if source == "mercadolibre":
                try:
                    await self._refresh_delivered_ml_orders()
                except Exception as e:
                    logger.error(f"[mercadolibre] Delivered refresh error (sync continues): {e}")

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

        1. Si el pedido llegó a 'delivered' (según _is_order_resolved):
           - Compara fecha de entrega real vs fecha límite → atrasado o a tiempo.

        2. Si desapareció del feed → se asume resuelto:
           - Pasó la fecha límite → atrasado.
           - Antes del plazo → a tiempo.

        3. Si sigue activo en el feed → se mantiene (OVERDUE si pasó la fecha).
        """
        now = datetime.now(_SANTIAGO_TZ)
        db_orders = self.order_repo.get_all_by_source(source)

        late, on_time = [], []
        for ext_id, order in db_orders.items():
            past_deadline = order.limit_delivery_date < now
            left_feed = ext_id not in fetched_ids

            if _is_order_resolved(order):
                # Entregado al cliente final — comparar fecha real de entrega vs plazo
                date_val = _get_delivery_date(order)
                if order.source == "mercadolibre":
                    was_late = _ml_was_late(order)
                elif date_val:
                    was_late = date_val > order.limit_delivery_date
                else:
                    was_late = past_deadline
                if was_late:
                    late.append(order)
                else:
                    on_time.append(order)
            elif left_feed:
                # Desapareció del feed

                # Shopify (Welivery/Starken): si desapareció del feed pero no fue shipped/delivered,
                # mantener activo (pendiente de preparación).
                if order.source.startswith("shopify") and order.status not in ("shipped", "delivered"):
                    continue  # keep in active orders until courier picks up

                # ML Flex: desaparecer del feed puede significar entrega o cancelación.
                # Si shipment.status == 'ready_to_ship' → nunca fue despachada → cancelada.
                # Si fue despachada (shipped/out_for_delivery/etc.) → asumimos entregada.
                if order.source == "mercadolibre":
                    raw = order.raw_data or {}
                    shipment = raw.get("shipment") or {}
                    if str(shipment.get("logistic_type", "")).lower() == "self_service":
                        shipment_status = str(shipment.get("status", "")).lower()
                        if shipment_status == "ready_to_ship":
                            order = order.model_copy(update={"status": "cancelled"})
                        else:
                            order = order.model_copy(update={"status": "delivered"})
                if past_deadline:
                    # Desapareció después del plazo → atrasado
                    late.append(order)
                else:
                    # Desapareció antes del plazo → resuelto temprano → a tiempo
                    on_time.append(order)
            # else: activo en el feed, plazo vencido → mantener visible como OVERDUE
            # else: activo, dentro del plazo → mantener

        delivery_dates = {o.id: _get_delivery_date(o) for o in late + on_time}

        # Compute handoff dates and blame for each resolved order
        handoff_dates: dict[str, datetime | None] = {}
        blame_map: dict[str, str | None] = {}
        for o in late + on_time:
            handoff_dt = _get_handoff_date(o)
            handoff_dates[o.id] = handoff_dt
            blame_map[o.id] = _compute_blame(o, handoff_dt, delivery_dates.get(o.id))

        if late:
            archived = self.delayed_repo.archive_batch(
                late, was_delayed=True, delivery_dates=delivery_dates,
                handoff_dates=handoff_dates, blame_map=blame_map,
            )
            logger.info(f"[{source}] Archived {archived} late orders")

        if on_time:
            self.delayed_repo.archive_batch(
                on_time, was_delayed=False, delivery_dates=delivery_dates,
                handoff_dates=handoff_dates, blame_map=blame_map,
            )
            logger.info(f"[{source}] Archived {len(on_time)} on-time orders")

        all_resolved = late + on_time
        if all_resolved:
            self.order_repo.delete_batch([o.id for o in all_resolved])
            logger.info(
                f"[{source}] Removed {len(late)} late + {len(on_time)} on-time orders"
            )

    async def _refresh_delivered_ml_orders(self) -> None:
        """Re-fetch shipment status for ML CE orders archived as 'shipped'.

        ML Centro de Envíos orders are archived when we hand the package to ML
        (shipment.status = 'shipped'). Later, ML delivers to the customer
        (status = 'delivered'). Since the ML mapper skips delivered orders, we
        need to explicitly re-check these archived orders every sync cycle.
        """
        from integrations.mercadolibre.client import MercadoLibreClient
        ml_client = self.integrations.get("mercadolibre")
        if not isinstance(ml_client, MercadoLibreClient):
            return

        rows = self.delayed_repo.get_shipped_historical("mercadolibre")
        if not rows:
            return

        updated = 0
        for row in rows:
            raw_data = row.get("raw_data") or {}
            shipment_id = (raw_data.get("shipment") or {}).get("id")
            if not shipment_id:
                continue
            shipment = await ml_client.get_shipment_status(shipment_id)
            if not shipment or shipment.get("status") != "delivered":
                continue
            status_history = shipment.get("status_history") or {}
            delivered_str = status_history.get("date_delivered")
            from datetime import timezone
            delivered_at = (
                parse_ml_datetime(delivered_str)
                if delivered_str
                else datetime.now(timezone.utc)
            )
            if delivered_at:
                self.delayed_repo.mark_delivered(row["id"], delivered_at)
                # Correct urgency if delivered before deadline
                raw_limit = row.get("limit_delivery_date")
                if raw_limit:
                    limit_dt = parse_ml_datetime(raw_limit) if isinstance(raw_limit, str) else raw_limit
                    if limit_dt and delivered_at < limit_dt:
                        self.delayed_repo.update_urgency(row["id"], "on_time")
                updated += 1

        if updated:
            logger.info(f"[mercadolibre] Updated {updated} CE orders to delivered")
