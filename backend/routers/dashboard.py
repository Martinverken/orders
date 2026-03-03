from fastapi import APIRouter
from services.order_service import OrderService

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
order_service = OrderService()


@router.get("/summary")
def get_summary():
    summary = order_service.get_dashboard_summary()
    return {"success": True, "data": summary.model_dump()}
