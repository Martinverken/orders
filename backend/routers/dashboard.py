from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict
from datetime import timedelta
from zoneinfo import ZoneInfo
import logging

_SANTIAGO_TZ = ZoneInfo("America/Santiago")
from services.order_service import OrderService
from repositories.delayed_order_repository import DelayedOrderRepository
from repositories.order_repository import OrderRepository
from models.order import _today_santiago
from integrations.welivery.client import get_delivery_status as welivery_get_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
order_service = OrderService()
delayed_repo = DelayedOrderRepository()
order_repo = OrderRepository()


def _enrich_with_welivery(order_dicts: list[dict]) -> None:
    """Enrich Shopify order dicts with Welivery delivery data (in-place)."""
    for d in order_dicts:
        source = d.get("source", "")
        if not source.startswith("shopify"):
            continue
        raw = d.get("raw_data") or {}
        fulfillments = raw.get("fulfillments") or []
        wid = None
        if len(fulfillments) == 1 and isinstance(fulfillments[0], dict):
            wid = fulfillments[0].get("tracking_number")
        if not wid:
            wid = str(raw.get("name", "")).lstrip("#") or None
        if not wid:
            continue
        try:
            ws = welivery_get_status(wid)
            if ws:
                d["welivery_status"] = ws.status
                d["welivery_depot_at"] = ws.depot_at.isoformat() if ws.depot_at else None
                d["welivery_delivered_at"] = ws.delivered_at.isoformat() if ws.delivered_at else None
        except Exception as e:
            logger.warning(f"[welivery] Failed to enrich {wid}: {e}")


@router.get("/summary")
def get_summary(
    source: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    product_name: Optional[str] = Query(None),
    logistics_operator: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    commune: Optional[str] = Query(None),
    order_number: Optional[str] = Query(None),
    perspective: str = Query("bodega"),
):
    summary = order_service.get_dashboard_summary(
        source=source,
        status=status,
        urgency=urgency,
        product_name=product_name,
        logistics_operator=logistics_operator,
        city=city,
        commune=commune,
        order_number=order_number,
        perspective=perspective,
    )
    return {"success": True, "data": summary.model_dump()}


@router.get("/yesterday-delays")
def get_yesterday_delays():
    """Returns orders that were delayed yesterday (archived + still active)."""
    today = _today_santiago()
    yesterday = today - timedelta(days=1)
    yesterday_iso = yesterday.isoformat()
    today_iso = today.isoformat()

    # 1. Archived orders with deadline yesterday that were delayed
    #    Filter by limit_delivery_date (the deadline), not resolved_at
    archived = delayed_repo.get_paginated(
        date_from=yesterday_iso,
        date_to_lt=today_iso,
        was_delayed=True,
        per_page=200,
    )["data"]

    # 2. Active orders with deadline yesterday that are still pending (overdue)
    result = (
        order_repo.db.table(order_repo.table)
        .select("*")
        .in_("status", ["pending", "ready_to_ship"])
        .gte("limit_handoff_date", yesterday_iso)
        .lt("limit_handoff_date", today_iso)
        .order("limit_handoff_date")
        .execute()
    )
    from models.order import Order
    active_overdue = [Order(**r) for r in (result.data or [])]

    archived_dicts = [o.model_dump() for o in archived]
    active_dicts = [o.model_dump() for o in active_overdue]
    _enrich_with_welivery(archived_dicts)
    _enrich_with_welivery(active_dicts)

    return {
        "success": True,
        "data": {
            "date": yesterday_iso,
            "archived_delayed": archived_dicts,
            "archived_delayed_count": len(archived),
            "active_overdue": active_dicts,
            "active_overdue_count": len(active_overdue),
            "total": len(archived) + len(active_overdue),
        },
    }


@router.get("/delays-by-day")
def get_delays_by_day(
    days: int = Query(30, ge=1, le=90),
    month: Optional[str] = Query(None),
):
    """Returns delayed orders grouped by deadline date (last N days or by month)."""
    if month:
        result = delayed_repo.get_paginated(
            was_delayed=True,
            month=month,
            per_page=1000,
        )
    else:
        today = _today_santiago()
        date_from = (today - timedelta(days=days)).isoformat()
        result = delayed_repo.get_paginated(
            was_delayed=True,
            date_from=date_from,
            per_page=500,
        )
    orders = result["data"]
    order_dicts = [o.model_dump(mode="json") for o in orders]

    # Also fetch active overdue orders
    today = _today_santiago()
    active_query = (
        order_repo.db.table(order_repo.table)
        .select("*, order_cases(*)")
        .eq("urgency", "overdue")
        .order("limit_handoff_date")
        .execute()
    )
    from models.order import Order as ActiveOrder
    active_overdue = []
    for r in (active_query.data or []):
        cases_raw = r.pop("order_cases", []) or []
        o = ActiveOrder(**r)
        d = o.model_dump(mode="json")
        d["_active"] = True
        # Compute approximate days_delayed from deadline
        deadline = o.limit_handoff_date or o.limit_delivery_date
        if deadline:
            delta = today - deadline.date() if hasattr(deadline, 'date') else today - deadline
            d["days_delayed"] = round(delta.days + (delta.seconds / 86400.0 if hasattr(delta, 'seconds') else 0), 1) if hasattr(delta, 'days') else 0
        else:
            d["days_delayed"] = 0
        d["cases"] = cases_raw
        active_overdue.append(d)

    # Apply month filter to active overdue if needed
    if month:
        y, m = int(month[:4]), int(month[5:7])
        month_start = f"{month}-01"
        if m == 12:
            next_month = f"{y+1}-01-01"
        else:
            next_month = f"{y}-{m+1:02d}-01"
        active_overdue = [
            d for d in active_overdue
            if month_start <= str(d.get("limit_handoff_date") or d.get("limit_delivery_date") or "")[:10] < next_month
        ]

    all_dicts = order_dicts + active_overdue

    # Group by deadline date
    by_day: dict[str, list[dict]] = defaultdict(list)
    for d in all_dicts:
        deadline = str(d.get("limit_handoff_date") or d.get("limit_delivery_date") or "")[:10]
        if deadline:
            by_day[deadline].append(d)

    # Sort days descending
    days_list = [
        {"date": date, "orders": orders_list, "count": len(orders_list)}
        for date, orders_list in sorted(by_day.items(), reverse=True)
    ]

    return {
        "success": True,
        "data": {
            "days": days_list,
            "total": len(all_dicts),
        },
    }


class WeliveryBatchRequest(BaseModel):
    ids: list[str]


@router.post("/welivery-batch")
def welivery_batch(req: WeliveryBatchRequest):
    """Fetch Welivery status for a batch of IDs (max 20)."""
    ids = req.ids[:20]
    results: dict[str, dict] = {}
    for wid in ids:
        try:
            ws = welivery_get_status(wid)
            if ws:
                results[wid] = {
                    "status": ws.status,
                    "depot_at": ws.depot_at.isoformat() if ws.depot_at else None,
                    "delivered_at": ws.delivered_at.isoformat() if ws.delivered_at else None,
                }
        except Exception as e:
            logger.warning(f"[welivery] batch failed for {wid}: {e}")
    return {"success": True, "data": results}


@router.get("/metrics/kpi")
def get_kpi_metrics():
    data = delayed_repo.get_kpi_metrics()
    return {"success": True, "data": data}


@router.get("/metrics/delays")
def get_delay_metrics():
    metrics = delayed_repo.get_historical_metrics()
    return {
        "success": True,
        "data": {
            "delayed": [m.model_dump() for m in metrics["delayed"]],
            "on_time": [m.model_dump() for m in metrics["on_time"]],
            "delayed_weekly": [m.model_dump() for m in metrics["delayed_weekly"]],
            "on_time_weekly": [m.model_dump() for m in metrics["on_time_weekly"]],
        },
    }


_FALABELLA_OPERATOR_LABELS: dict[str, str] = {
    "regular - bluexpress": "Bluexpress",
    "regular-bluexpress": "Bluexpress",
    "bluexpress": "Bluexpress",
    "regular - starken": "Starken",
    "regular-starken": "Starken",
    "starken": "Starken",
    "regular - chilexpress": "Chilexpress",
    "regular-chilexpress": "Chilexpress",
    "chilexpress": "Chilexpress",
    "direct": "Welivery",
    "falaflex": "Welivery",
    "centro_envios": "Centro Envíos",
    "centro envios": "Centro Envíos",
}


def _carrier_from_order(source: str, logistics_operator: str | None) -> str:
    """Derive a display carrier name from order source and logistics_operator."""
    if source == "mercadolibre":
        return "Mercado Libre"
    if source == "walmart":
        return "Transporte Interno"
    if source.startswith("shopify"):
        return "Welivery"
    if source == "paris":
        return "Bluexpress"
    if source == "falabella":
        lo = (logistics_operator or "").strip().lower()
        return _FALABELLA_OPERATOR_LABELS.get(lo, logistics_operator or "Falabella")
    return logistics_operator or source


@router.get("/warehouse-summary")
def get_warehouse_summary():
    """Return per-carrier counts of orders due today + overdue, with pickup cutoff derived from limit_handoff_date."""
    from models.order import Order as _Order
    today = _today_santiago()
    tomorrow = today + timedelta(days=1)

    # Query all pending/ready_to_ship orders and classify by limit_handoff_date
    # (falling back to limit_delivery_date when limit_handoff_date is absent).
    # get_overdue() / get_due_today() use limit_delivery_date which misses Shopify
    # orders where limit_handoff_date (bodega → carrier) is today but
    # limit_delivery_date (carrier → customer) is tomorrow.
    result = (
        order_repo.db.table(order_repo.table)
        .select("*")
        .in_("status", ["pending", "ready_to_ship"])
        .execute()
    )
    all_pending = [_Order(**r) for r in (result.data or [])]

    overdue: list[_Order] = []
    due_today: list[_Order] = []
    for order in all_pending:
        deadline = order.limit_handoff_date or order.limit_delivery_date
        if not deadline:
            continue
        dl_date = deadline.astimezone(_SANTIAGO_TZ).date() if deadline.tzinfo else deadline.date()
        if dl_date < today:
            overdue.append(order)
        elif dl_date == today:
            due_today.append(order)

    # Group by carrier — cutoff = time portion of limit_handoff_date, only from today's orders.
    # Overdue orders have past dates; their HH:MM is no longer the relevant cutoff for today.
    carrier_data: dict[str, dict] = {}

    def _upsert(order, field: str) -> None:
        name = _carrier_from_order(order.source, order.logistics_operator)
        # Only use the cutoff time if the limit_handoff_date is today in Santiago (not a past date)
        cutoff = None
        if order.limit_handoff_date:
            lhd_santiago = order.limit_handoff_date.astimezone(_SANTIAGO_TZ) if order.limit_handoff_date.tzinfo else order.limit_handoff_date
            if lhd_santiago.date() == today:
                cutoff = lhd_santiago.strftime("%H:%M")
        if name not in carrier_data:
            carrier_data[name] = {"carrier": name, "overdue": 0, "due_today": 0, "pickup_cutoff": cutoff}
        else:
            # Keep earliest cutoff for today across all orders for this carrier
            existing = carrier_data[name]["pickup_cutoff"]
            if cutoff and (existing is None or cutoff < existing):
                carrier_data[name]["pickup_cutoff"] = cutoff
        carrier_data[name][field] += 1

    for order in overdue:
        _upsert(order, "overdue")
    for order in due_today:
        _upsert(order, "due_today")

    # Sort: carriers with cutoff first (by time), then those without
    by_carrier = sorted(
        carrier_data.values(),
        key=lambda x: (x["pickup_cutoff"] is None, x["pickup_cutoff"] or ""),
    )

    # Group by deadline date for ALL pending orders (overdue + today + future)
    day_map: dict[str, dict] = {}
    for order in all_pending:
        deadline = order.limit_handoff_date or order.limit_delivery_date
        if not deadline:
            continue
        dl_date = deadline.astimezone(_SANTIAGO_TZ).date() if deadline.tzinfo else deadline.date()
        key = dl_date.isoformat()
        if key not in day_map:
            day_map[key] = {"date": key, "count": 0, "overdue": 0, "due_today": 0}
        day_map[key]["count"] += 1
        if dl_date < today:
            day_map[key]["overdue"] += 1
        elif dl_date == today:
            day_map[key]["due_today"] += 1
    by_day = sorted(day_map.values(), key=lambda x: x["date"])

    # Group by source (platform view) — only overdue + due_today
    source_map: dict[str, dict] = {}
    for order in overdue:
        src = order.source
        if src not in source_map:
            source_map[src] = {"source": src, "overdue": 0, "due_today": 0}
        source_map[src]["overdue"] += 1
    for order in due_today:
        src = order.source
        if src not in source_map:
            source_map[src] = {"source": src, "overdue": 0, "due_today": 0}
        source_map[src]["due_today"] += 1
    by_platform = sorted(source_map.values(), key=lambda x: x["source"])

    return {"success": True, "data": {"by_carrier": by_carrier, "by_day": by_day, "by_platform": by_platform}}
