from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CourierCreate(BaseModel):
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


class Courier(CourierCreate):
    id: str
    created_at: datetime
    updated_at: datetime
