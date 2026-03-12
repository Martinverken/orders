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
