from fastapi import APIRouter, Query
from typing import Optional
from collections import defaultdict
from datetime import timedelta
import logging
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
):
    """Returns delayed orders grouped by deadline date (last N days)."""
    today = _today_santiago()
    date_from = (today - timedelta(days=days)).isoformat()

    result = delayed_repo.get_paginated(
        was_delayed=True,
        date_from=date_from,
        per_page=500,
    )
    orders = result["data"]

    # Enrich Shopify orders with Welivery data
    order_dicts = [o.model_dump() for o in orders]
    _enrich_with_welivery(order_dicts)

    # Group by deadline date
    by_day: dict[str, list[dict]] = defaultdict(list)
    for d in order_dicts:
        deadline = (d.get("limit_handoff_date") or d.get("limit_delivery_date") or "")[:10]
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
            "total": len(order_dicts),
        },
    }


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
