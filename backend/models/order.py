from pydantic import BaseModel, model_validator
from datetime import datetime, date, timedelta
from typing import Optional, Any
from enum import Enum
from zoneinfo import ZoneInfo

_SANTIAGO_TZ = ZoneInfo("America/Santiago")


def _today_santiago() -> date:
    """Fecha actual en Santiago de Chile."""
    return datetime.now(_SANTIAGO_TZ).date()


class OrderUrgency(str, Enum):
    OVERDUE = "overdue"              # pending/ready_to_ship/shipped con fecha anterior a hoy (enviado tarde)
    DUE_TODAY = "due_today"          # pending/ready_to_ship para hoy
    DELIVERED_TODAY = "delivered_today"  # shipped con fecha límite hoy (enviado a tiempo)
    TOMORROW = "tomorrow"            # pending/ready_to_ship para mañana
    TWO_OR_MORE_DAYS = "two_or_more_days"  # pending/ready_to_ship con fecha >= pasado mañana
    ON_TIME = "on_time"              # todo lo demás (shipped/delivered dentro del plazo)


_PENDING_LIKE = {"pending", "ready_to_ship"}
# Estados que significan "resuelto" — shipped = entregado al operador (Falabella Regular)
_RESOLVED_LIKE = {"shipped", "delivered"}


def compute_urgency(limit_delivery_date: datetime, status: str = "") -> OrderUrgency:
    today = _today_santiago()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)
    delivery_date = limit_delivery_date.date() if hasattr(limit_delivery_date, "date") else limit_delivery_date

    # Pasó la fecha límite: si sigue pendiente O si fue enviado después del plazo → atrasado
    if delivery_date < today and status in (_PENDING_LIKE | _RESOLVED_LIKE):
        return OrderUrgency.OVERDUE
    if delivery_date == today and status in _PENDING_LIKE:
        return OrderUrgency.DUE_TODAY
    if delivery_date == today and status in _RESOLVED_LIKE:
        return OrderUrgency.DELIVERED_TODAY  # enviado/entregado justo a tiempo
    if delivery_date == tomorrow and status in _PENDING_LIKE:
        return OrderUrgency.TOMORROW
    if delivery_date >= day_after and status in _PENDING_LIKE:
        return OrderUrgency.TWO_OR_MORE_DAYS
    return OrderUrgency.ON_TIME


class OrderCreate(BaseModel):
    """Normalized order shape that every integration mapper must produce."""
    external_id: str
    source: str                          # 'falabella' | 'mercadolibre'
    status: str
    created_at_source: Optional[datetime] = None
    address_updated_at: Optional[datetime] = None
    limit_delivery_date: datetime
    product_name: Optional[str] = None
    product_quantity: Optional[int] = None
    raw_data: Optional[dict[str, Any]] = None


class Order(OrderCreate):
    """Full DB record returned by repositories."""
    id: str
    synced_at: datetime
    updated_at: datetime
    # Stored in DB at sync time; falls back to computed value for legacy rows without it
    urgency: Optional[OrderUrgency] = None
    # Set by DB trigger on first transition to 'shipped'/'delivered' (Falabella); immutable thereafter
    first_shipped_at: Optional[datetime] = None
    first_delivered_at: Optional[datetime] = None

    @model_validator(mode="after")
    def fill_urgency(self) -> "Order":
        if self.urgency is None:
            self.urgency = compute_urgency(self.limit_delivery_date, self.status)
        return self


class OrderSummary(BaseModel):
    """Shape returned by GET /api/dashboard/summary."""
    total_orders: int
    overdue_count: int
    due_today_count: int
    delivered_today_count: int
    tomorrow_count: int
    two_or_more_days_count: int
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


class OrderCase(BaseModel):
    """A single ticket/case entry linked to a historical order."""
    id: str
    delayed_order_id: Optional[str] = None
    order_id: Optional[str] = None
    case_number: Optional[str] = None
    case_status: Optional[str] = None
    comments: Optional[str] = None
    created_at: datetime


class HistoricalOrder(BaseModel):
    """Full record from delayed_orders table for the historical orders view."""
    id: str
    external_id: str
    source: str
    limit_delivery_date: datetime
    resolved_at: datetime
    delivered_at: Optional[datetime] = None
    days_delayed: float
    logistics_operator: Optional[str] = None
    urgency: Optional[str] = None
    status: Optional[str] = None
    raw_data: Optional[dict[str, Any]] = None
    comprobante: Optional[str] = None
    case_number: Optional[str] = None
    comments: Optional[str] = None
    case_status: Optional[str] = None
    cases: list[OrderCase] = []


class HistoricalOrdersPage(BaseModel):
    data: list[HistoricalOrder]
    total: int
    page: int
    per_page: int
    pages: int


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
