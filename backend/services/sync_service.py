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
from models.order import OrderCreate

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
_SANTIAGO_TZ = ZoneInfo("America/Santiago")


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

    # Statuses that mean an order is definitively fulfilled (no longer active)
    _TERMINAL_STATUSES = {"delivered", "completed", "cancelled", "failed_delivery", "returned"}

    def _cleanup_resolved(self, source: str, fetched_ids: set[str]) -> None:
        """Archive late orders and delete on-time orders that left the API feed
        or that have a terminal status (delivered/completed/etc.)."""
        now = datetime.now(_SANTIAGO_TZ)
        db_ids = self.order_repo.get_all_external_ids(source)

        # Orders that disappeared from the feed + orders with terminal status in the feed
        disappeared_ids = db_ids - fetched_ids
        terminal_in_feed = {
            oid for oid in fetched_ids
            if (o := self.order_repo.get_by_external_id(oid, source))
            and o.status in self._TERMINAL_STATUSES
        }
        resolved_ids = disappeared_ids | terminal_in_feed

        if not resolved_ids:
            return

        delayed, on_time = [], []
        for ext_id in resolved_ids:
            order = self.order_repo.get_by_external_id(ext_id, source)
            if order is None:
                continue
            if order.limit_delivery_date < now:
                delayed.append(order)
            else:
                on_time.append(order)

        if delayed:
            archived = self.delayed_repo.archive_batch(delayed)
            logger.info(f"[{source}] Archived {archived} delayed orders")

        all_resolved = delayed + on_time
        if all_resolved:
            self.order_repo.delete_batch([o.id for o in all_resolved])
            logger.info(
                f"[{source}] Removed {len(delayed)} late + {len(on_time)} on-time resolved orders"
            )
