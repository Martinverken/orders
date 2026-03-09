"""SKU master and shipping cost models."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SKUCreate(BaseModel):
    """Input for creating/updating a SKU."""
    sku: str
    product_name: str
    weight_kg: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    length_cm: float = Field(gt=0)


class SKU(SKUCreate):
    """Full SKU record from DB."""
    id: str
    sum_sides_cm: float
    created_at: datetime
    updated_at: datetime


class CourierQuote(BaseModel):
    """Shipping cost quote from a courier for a specific SKU."""
    courier: str
    available: bool
    price: Optional[int] = None        # CLP con IVA
    price_net: Optional[int] = None    # CLP sin IVA
    tier: Optional[str] = None         # ej: "Normal", "XL", "3XL RURAL"
    reason: Optional[str] = None       # si no available, por qué


class ShippingQuoteResponse(BaseModel):
    """All courier quotes for a SKU + destination."""
    sku: str
    product_name: str
    weight_kg: float
    sum_sides_cm: float
    commune: Optional[str] = None
    quotes: list[CourierQuote]
