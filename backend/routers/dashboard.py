from fastapi import APIRouter
from services.order_service import OrderService
from repositories.delayed_order_repository import DelayedOrderRepository

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
order_service = OrderService()
delayed_repo = DelayedOrderRepository()


@router.get("/summary")
def get_summary():
    summary = order_service.get_dashboard_summary()
    return {"success": True, "data": summary.model_dump()}


@router.get("/metrics/delays")
def get_delay_metrics():
    metrics = delayed_repo.get_historical_metrics()
    return {
        "success": True,
        "data": {
            "delayed": [m.model_dump() for m in metrics["delayed"]],
            "on_time": [m.model_dump() for m in metrics["on_time"]],
        },
    }
