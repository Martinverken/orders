from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from repositories.courier_repository import CourierRepository
from models.courier import CourierCreate

router = APIRouter(prefix="/api/couriers", tags=["couriers"])
repo = CourierRepository()


class CourierRequest(BaseModel):
    name: str
    pricing_type: Optional[str] = None
    base_price: Optional[float] = None
    price_per_kg: Optional[float] = None
    max_weight_kg: Optional[float] = None
    max_length_cm: Optional[float] = None
    max_width_cm: Optional[float] = None
    max_height_cm: Optional[float] = None
    notes: Optional[str] = None
    active: bool = True


class CourierUpdateRequest(BaseModel):
    name: Optional[str] = None
    pricing_type: Optional[str] = None
    base_price: Optional[float] = None
    price_per_kg: Optional[float] = None
    max_weight_kg: Optional[float] = None
    max_length_cm: Optional[float] = None
    max_width_cm: Optional[float] = None
    max_height_cm: Optional[float] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


@router.get("")
def list_couriers():
    couriers = repo.list()
    return {"success": True, "data": [c.model_dump() for c in couriers]}


@router.post("")
def create_courier(body: CourierRequest):
    data = CourierCreate(**body.model_dump())
    courier = repo.create(data)
    return {"success": True, "data": courier.model_dump()}


@router.patch("/{courier_id}")
def update_courier(courier_id: str, body: CourierUpdateRequest):
    existing = repo.get(courier_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Courier no encontrado")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    courier = repo.update(courier_id, updates)
    return {"success": True, "data": courier.model_dump()}


@router.delete("/{courier_id}")
def delete_courier(courier_id: str):
    existing = repo.get(courier_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Courier no encontrado")
    repo.delete(courier_id)
    return {"success": True}
