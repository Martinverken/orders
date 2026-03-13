from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    sku: str
    brand: Optional[str] = None
    category: Optional[str] = None
    height_cm: Optional[float] = None
    width_cm: Optional[float] = None
    length_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    image_url: Optional[str] = None
    num_bultos: int = 1
    is_service: bool = False
    is_pack: bool = False
    bultos_dims: Optional[list[dict]] = None
    pack_items: Optional[list[dict]] = None  # [{sku: str, quantity: int}]


class Product(ProductCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class ProductsPage(BaseModel):
    data: list[Product]
    total: int
    page: int
    per_page: int
    pages: int
