from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from repositories.product_repository import ProductRepository
from models.product import ProductCreate

router = APIRouter(prefix="/api/products", tags=["products"])
repo = ProductRepository()


class ProductRequest(BaseModel):
    name: str
    sku: str
    height_cm: Optional[float] = None
    width_cm: Optional[float] = None
    length_cm: Optional[float] = None
    weight_kg: Optional[float] = None


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    height_cm: Optional[float] = None
    width_cm: Optional[float] = None
    length_cm: Optional[float] = None
    weight_kg: Optional[float] = None


@router.get("")
def list_products(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    result = repo.list(page=page, per_page=per_page)
    return result.model_dump()


@router.post("")
def create_product(body: ProductRequest):
    data = ProductCreate(**body.model_dump())
    product = repo.create(data)
    return {"success": True, "data": product.model_dump()}


@router.patch("/{product_id}")
def update_product(product_id: str, body: ProductUpdateRequest):
    existing = repo.get(product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    product = repo.update(product_id, updates)
    return {"success": True, "data": product.model_dump()}


@router.delete("/{product_id}")
def delete_product(product_id: str):
    existing = repo.get(product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    repo.delete(product_id)
    return {"success": True}
