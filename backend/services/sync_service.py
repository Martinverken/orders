import logging
import time
from datetime import datetime

from integrations.base import BaseIntegration, IntegrationError
from integrations.falabella.client import FalabellaClient
from integrations.mercadolibre.client import MercadoLibreClient
from repositories.order_repository import OrderRepository
from repositories.sync_log_repository import SyncLogRepository
from models.sync_log import SyncLogCreate, SyncStatus, SyncResult
from models.order import OrderCreate

logger = logging.getLogger(__name__)

BATCH_SIZE = 50


class SyncService:
    def __init__(self):
        self.order_repo = OrderRepository()
        self.sync_log_repo = SyncLogRepository()
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

        try:
            async for order in integration.fetch_pending_orders():
                batch.append(order)
                orders_fetched += 1
                if len(batch) >= BATCH_SIZE:
                    orders_upserted += self.order_repo.upsert_batch(batch)
                    batch = []

            if batch:
                orders_upserted += self.order_repo.upsert_batch(batch)

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
