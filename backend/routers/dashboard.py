from fastapi import APIRouter, Query
from typing import Optional
from datetime import timedelta
from services.order_service import OrderService
from repositories.delayed_order_repository import DelayedOrderRepository
from repositories.order_repository import OrderRepository
from models.order import _today_santiago

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
order_service = OrderService()
delayed_repo = DelayedOrderRepository()
order_repo = OrderRepository()


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

    # 1. Archived orders resolved yesterday that were delayed
    #    Use date_to_lt (exclusive) so deadlines at any hour of the day are included
    archived = delayed_repo.get_paginated(
        date_from=yesterday_iso,
        date_to_lt=today_iso,
        was_delayed=True,
        per_page=100,
    )

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

    return {
        "success": True,
        "data": {
            "date": yesterday_iso,
            "archived_delayed": [o.model_dump() for o in archived["data"]],
            "archived_delayed_count": len(archived["data"]),
            "active_overdue": [o.model_dump() for o in active_overdue],
            "active_overdue_count": len(active_overdue),
            "total": len(archived["data"]) + len(active_overdue),
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
