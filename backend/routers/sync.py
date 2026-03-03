from fastapi import APIRouter, Body
from typing import Optional
from services.sync_service import SyncService
from repositories.sync_log_repository import SyncLogRepository

router = APIRouter(prefix="/api/sync", tags=["sync"])
sync_log_repo = SyncLogRepository()


@router.post("/run")
async def run_sync(source: Optional[str] = Body("all", embed=True)):
    sync_service = SyncService()
    if source and source != "all":
        result = await sync_service.run_single_source(source)
        results = [result]
    else:
        results = await sync_service.run_full_sync()

    return {
        "success": True,
        "results": [r.model_dump() for r in results],
        "total_fetched": sum(r.orders_fetched for r in results),
        "total_upserted": sum(r.orders_upserted for r in results),
    }


@router.get("/status")
def get_sync_status():
    last_sync = sync_log_repo.get_last_sync()
    recent_logs = sync_log_repo.get_recent(limit=10)
    return {
        "success": True,
        "last_sync": last_sync.model_dump() if last_sync else None,
        "recent_logs": [log.model_dump() for log in recent_logs],
    }
