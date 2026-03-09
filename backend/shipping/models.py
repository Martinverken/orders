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


def classify_size(sum_sides_cm: float, weight_kg: float) -> str:
    """Classify a SKU into a size category.

    Rules (evaluated top-down, first match wins):
    - Extragrande: sum_sides > 180 OR weight > 20
    - Grande:      sum_sides <= 180 AND weight <= 20
    - Mediano:     sum_sides <= 120 AND weight <= 20
    - Pequeño:     sum_sides <= 60  AND weight <= 20
    """
    if sum_sides_cm > 180 or weight_kg > 20:
        return "Extragrande"
    if sum_sides_cm > 120:
        return "Grande"
    if sum_sides_cm > 60:
        return "Mediano"
    return "Pequeño"


class SKU(SKUCreate):
    """Full SKU record from DB."""
    id: str
    sum_sides_cm: float
    size_category: str = ""
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
    size_category: str = ""
    commune: Optional[str] = None
    quotes: list[CourierQuote]
