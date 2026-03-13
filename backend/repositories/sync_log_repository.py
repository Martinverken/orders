from database import get_supabase
from models.sync_log import SyncLog, SyncLogCreate, SyncStatus
from datetime import datetime, timezone
from typing import Optional


class SyncLogRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "sync_logs"

    def create(self, data: SyncLogCreate) -> SyncLog:
        result = self.db.table(self.table).insert(data.model_dump()).execute()
        return SyncLog(**result.data[0])

    def update(
        self,
        log_id: str,
        status: SyncStatus,
        orders_fetched: int = 0,
        orders_upserted: int = 0,
        error_message: Optional[str] = None,
    ) -> SyncLog:
        result = (
            self.db.table(self.table)
            .update(
                {
                    "status": status,
                    "orders_fetched": orders_fetched,
                    "orders_upserted": orders_upserted,
                    "error_message": error_message,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", log_id)
            .execute()
        )
        return SyncLog(**result.data[0])

    def get_last_sync(self, source: Optional[str] = None) -> Optional[SyncLog]:
        query = (
            self.db.table(self.table)
            .select("*")
            .eq("status", SyncStatus.SUCCESS)
            .order("started_at", desc=True)
            .limit(1)
        )
        if source:
            query = query.eq("source", source)
        result = query.execute()
        return SyncLog(**result.data[0]) if result.data else None

    def get_recent(self, limit: int = 10) -> list[SyncLog]:
        result = (
            self.db.table(self.table)
            .select("*")
            .order("started_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [SyncLog(**r) for r in (result.data or [])]
