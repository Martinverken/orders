from fastapi import APIRouter, Query
from typing import Optional
from services.order_service import OrderService
from repositories.delayed_order_repository import DelayedOrderRepository

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
order_service = OrderService()
delayed_repo = DelayedOrderRepository()


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
    )
    return {"success": True, "data": summary.model_dump()}


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
