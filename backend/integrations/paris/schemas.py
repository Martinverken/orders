"""Paris (Cencosud) order schemas.

STUB: The Cencosud Developer Portal (developers.ecomm.cencosud.com) is JS-rendered
and its API reference could not be scraped. These schemas are based on common
Seller Center API patterns and will need adjustment once real API responses are available.

Paris uses Cencosud's Seller Center platform.
Docs: https://developers.ecomm.cencosud.com/docs
"""

from pydantic import BaseModel
from typing import Optional, Any


class ParisOrderItem(BaseModel):
    """Single item within a Paris order.

    TODO: Adjust field names to match real Cencosud API response.
    """
    item_id: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity: Optional[int] = None
    price: Optional[float] = None
    status: Optional[str] = None

    class Config:
        extra = "allow"


class ParisOrder(BaseModel):
    """Raw order from Paris (Cencosud) API.

    TODO: Adjust field names to match real Cencosud API response.
    Expected fields based on Seller Center patterns similar to Falabella.
    """
    order_id: Optional[str] = None
    order_number: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Delivery deadline — the key field we track
    promised_shipping_time: Optional[str] = None
    shipping_provider: Optional[str] = None
    tracking_code: Optional[str] = None
    items: Optional[list[dict]] = None
    # Shipping address
    shipping_address: Optional[dict] = None

    class Config:
        extra = "allow"
