from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class SyncStatus(str, Enum):
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"


class SyncLogCreate(BaseModel):
    source: str
    status: SyncStatus = SyncStatus.RUNNING
    orders_fetched: int = 0
    orders_upserted: int = 0
    error_message: Optional[str] = None


class SyncLog(SyncLogCreate):
    id: str
    started_at: datetime
    finished_at: Optional[datetime] = None


class SyncResult(BaseModel):
    source: str
    orders_fetched: int = 0
    orders_upserted: int = 0
    error: Optional[str] = None
    duration_ms: Optional[int] = None
