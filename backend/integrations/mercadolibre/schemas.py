from pydantic import BaseModel
from typing import Optional, Any


class MLShipping(BaseModel):
    id: Optional[int] = None
    shipment_type: Optional[str] = None   # 'self_service' | 'fulfillment' | 'drop_off' | 'xd_drop_off'
    logistic_type: Optional[str] = None   # 'fulfillment' | 'self_service' | 'cross_docking'
    mode: Optional[str] = None            # 'me2' | 'custom'
    substatus: Optional[str] = None
    date_created: Optional[str] = None
    last_updated: Optional[str] = None
    estimated_delivery_time: Optional[Any] = None

    class Config:
        extra = "allow"


class MLOrder(BaseModel):
    id: Optional[int] = None
    status: Optional[str] = None          # 'paid' | 'pending' | 'cancelled' | 'invalid'
    date_created: Optional[str] = None
    date_last_updated: Optional[str] = None
    date_closed: Optional[str] = None
    expiration_date: Optional[str] = None
    shipping: Optional[MLShipping] = None
    tags: Optional[list[str]] = None

    class Config:
        extra = "allow"


class MLShipmentDetail(BaseModel):
    """Detail from /shipments/{id} endpoint — contains delivery deadline and mode."""
    id: Optional[int] = None
    status: Optional[str] = None
    substatus: Optional[str] = None
    mode: Optional[str] = None
    logistic_type: Optional[str] = None   # key: 'fulfillment' = Centro de envíos, 'self_service' = Flex
    date_created: Optional[str] = None
    last_updated: Optional[str] = None
    # Estimated delivery window (top-level; null for ready_to_ship orders)
    estimated_delivery_time: Optional[Any] = None  # may be nested dict with 'date' field
    # shipping_option contains the real deadline when estimated_delivery_time is null
    shipping_option: Optional[Any] = None

    class Config:
        extra = "allow"
