from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from pydantic import BaseModel
from repositories.order_repository import OrderRepository
from repositories.delayed_order_repository import DelayedOrderRepository
from models.order import Order, OrdersPage


class CaseUpdateRequest(BaseModel):
    case_number: Optional[str] = None
    comments: Optional[str] = None
    case_status: Optional[str] = None

router = APIRouter(prefix="/api/orders", tags=["orders"])
order_repo = OrderRepository()
delayed_repo = DelayedOrderRepository()


@router.get("/cities", response_model=dict)
def get_distinct_cities():
    cities = order_repo.get_distinct_cities()
    return {"success": True, "data": cities}


@router.get("/communes", response_model=dict)
def get_distinct_communes(city: Optional[str] = Query(None)):
    communes = order_repo.get_distinct_communes(city)
    return {"success": True, "data": communes}


@router.get("/history/cities", response_model=dict)
def get_historical_distinct_cities():
    cities = delayed_repo.get_distinct_cities()
    return {"success": True, "data": cities}


@router.get("/history/communes", response_model=dict)
def get_historical_distinct_communes(city: Optional[str] = Query(None)):
    communes = delayed_repo.get_distinct_communes(city)
    return {"success": True, "data": communes}


@router.get("/history")
def list_historical_orders(
    source: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    logistics_operator: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    commune: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    was_delayed = None
    if urgency == "atrasado":
        was_delayed = True
    elif urgency == "a_tiempo":
        was_delayed = False
    return delayed_repo.get_paginated(
        source=source,
        was_delayed=was_delayed,
        logistics_operator=logistics_operator,
        city=city,
        commune=commune,
        page=page,
        per_page=per_page,
    )


@router.patch("/history/{record_id}/case", response_model=dict)
def update_case_info(record_id: str, body: CaseUpdateRequest):
    """Update case number and comments for a historical order."""
    delayed_repo.update_case_info(record_id, body.case_number, body.comments, body.case_status)
    return {"success": True}


@router.post("/history/refresh-comprobantes", response_model=dict)
def refresh_comprobantes():
    """Fetch and save comprobantes from Welivery for Flex ML orders that don't have one yet."""
    updated = delayed_repo.refresh_missing_comprobantes()
    return {"success": True, "updated": updated}


@router.get("", response_model=OrdersPage)
def list_orders(
    source: Optional[str] = Query(None, description="falabella | mercadolibre"),
    status: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None, description="overdue | due_today | delivered_today | tomorrow | on_time"),
    product_name: Optional[str] = Query(None),
    logistics_operator: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    commune: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    return order_repo.get_paginated(
        source=source, status=status, urgency=urgency,
        product_name=product_name, logistics_operator=logistics_operator,
        city=city, commune=commune,
        page=page, per_page=per_page,
    )


@router.get("/overdue", response_model=dict)
def get_overdue_orders():
    orders = order_repo.get_overdue()
    return {"success": True, "data": orders, "count": len(orders)}


@router.get("/due-today", response_model=dict)
def get_due_today_orders():
    orders = order_repo.get_due_today()
    return {"success": True, "data": orders, "count": len(orders)}


@router.get("/delivered-today", response_model=dict)
def get_delivered_today_orders():
    orders = order_repo.get_delivered_today()
    return {"success": True, "data": orders, "count": len(orders)}


@router.get("/tomorrow", response_model=dict)
def get_tomorrow_orders():
    orders = order_repo.get_tomorrow()
    return {"success": True, "data": orders, "count": len(orders)}


@router.get("/{order_id}", response_model=dict)
def get_order(order_id: str, source: str = Query("falabella")):
    order = order_repo.get_by_external_id(order_id, source)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"success": True, "data": order}
