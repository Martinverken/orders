from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from repositories.order_repository import OrderRepository
from models.order import Order, OrdersPage

router = APIRouter(prefix="/api/orders", tags=["orders"])
order_repo = OrderRepository()


@router.get("", response_model=OrdersPage)
def list_orders(
    source: Optional[str] = Query(None, description="falabella | mercadolibre"),
    status: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None, description="overdue | due_today | delivered_today | tomorrow | on_time"),
    product_name: Optional[str] = Query(None),
    logistics_operator: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    return order_repo.get_paginated(
        source=source, status=status, urgency=urgency,
        product_name=product_name, logistics_operator=logistics_operator,
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
