from pydantic import BaseModel, computed_field
from datetime import datetime, date, timedelta
from typing import Optional, Any
from enum import Enum
from zoneinfo import ZoneInfo

_SANTIAGO_TZ = ZoneInfo("America/Santiago")


def _today_santiago() -> date:
    """Fecha actual en Santiago de Chile."""
    return datetime.now(_SANTIAGO_TZ).date()


class OrderUrgency(str, Enum):
    OVERDUE = "overdue"          # pending/ready_to_ship con fecha anterior a hoy
    DUE_TODAY = "due_today"      # pending/ready_to_ship para hoy
    DELIVERED_TODAY = "delivered_today"  # shipped con fecha de hoy
    TOMORROW = "tomorrow"        # pending/ready_to_ship para mañana
    ON_TIME = "on_time"          # todo lo demás


_PENDING_LIKE = {"pending", "ready_to_ship"}


def compute_urgency(limit_delivery_date: datetime, status: str = "") -> OrderUrgency:
    today = _today_santiago()
    tomorrow = today + timedelta(days=1)
    delivery_date = limit_delivery_date.date() if hasattr(limit_delivery_date, "date") else limit_delivery_date

    if delivery_date < today and status in _PENDING_LIKE:
        return OrderUrgency.OVERDUE
    if delivery_date == today and status in _PENDING_LIKE:
        return OrderUrgency.DUE_TODAY
    if delivery_date == today and status == "shipped":
        return OrderUrgency.DELIVERED_TODAY
    if delivery_date == tomorrow and status in _PENDING_LIKE:
        return OrderUrgency.TOMORROW
    return OrderUrgency.ON_TIME


class OrderCreate(BaseModel):
    """Normalized order shape that every integration mapper must produce."""
    external_id: str
    source: str                          # 'falabella' | 'mercadolibre'
    status: str
    created_at_source: Optional[datetime] = None
    address_updated_at: Optional[datetime] = None
    limit_delivery_date: datetime
    raw_data: Optional[dict[str, Any]] = None


class Order(OrderCreate):
    """Full DB record returned by repositories."""
    id: str
    synced_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def urgency(self) -> OrderUrgency:
        return compute_urgency(self.limit_delivery_date, self.status)


class OrderSummary(BaseModel):
    """Shape returned by GET /api/dashboard/summary."""
    total_orders: int
    overdue_count: int
    due_today_count: int
    delivered_today_count: int
    tomorrow_count: int
    on_time_count: int
    last_sync_at: Optional[datetime] = None
    sources: list[str]


class OrdersPage(BaseModel):
    data: list[Order]
    total: int
    page: int
    per_page: int
    pages: int


class DelayedOrder(BaseModel):
    """Archived delayed order stored for monthly metrics."""
    id: str
    external_id: str
    source: str
    limit_delivery_date: datetime
    resolved_at: datetime
    days_delayed: float


class OnTimeMetric(BaseModel):
    """Monthly on-time delivery count by source and logistics operator."""
    month: str
    source: str
    logistics_operator: str
    count: int


class DelayMetric(BaseModel):
    """Monthly delay metric by source and logistics operator."""
    month: str          # e.g. "2026-01"
    source: str
    logistics_operator: str
    count: int
    avg_days_delayed: float
