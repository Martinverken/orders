from pydantic import BaseModel
from typing import Optional, Any


class WalmartOrderLineItem(BaseModel):
    """Product info nested inside an order line."""
    productName: Optional[str] = None
    sku: Optional[str] = None

    class Config:
        extra = "allow"


class WalmartOrderLineQuantity(BaseModel):
    unitOfMeasurement: Optional[str] = None
    amount: Optional[str] = None

    class Config:
        extra = "allow"


class WalmartOrderLineStatus(BaseModel):
    status: Optional[str] = None
    statusQuantity: Optional[WalmartOrderLineQuantity] = None
    trackingInfo: Optional[Any] = None

    class Config:
        extra = "allow"


class WalmartOrderLine(BaseModel):
    """Single line item within a Walmart order."""
    lineNumber: Optional[str] = None
    item: Optional[WalmartOrderLineItem] = None
    charges: Optional[list] = None
    orderLineQuantity: Optional[WalmartOrderLineQuantity] = None
    statusDate: Optional[int] = None  # epoch millis
    orderLineStatuses: Optional[list[WalmartOrderLineStatus]] = None
    fulfillment: Optional[dict] = None

    class Config:
        extra = "allow"


class WalmartPostalAddress(BaseModel):
    name: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postalCode: Optional[str] = None
    country: Optional[str] = None
    addressType: Optional[str] = None

    class Config:
        extra = "allow"


class WalmartShippingInfo(BaseModel):
    phone: Optional[str] = None
    estimatedDeliveryDate: Optional[int] = None  # epoch millis
    estimatedShipDate: Optional[int] = None  # epoch millis
    methodCode: Optional[str] = None  # e.g. "Standard"
    postalAddress: Optional[WalmartPostalAddress] = None

    class Config:
        extra = "allow"


class WalmartOrder(BaseModel):
    """Raw order from Walmart GET /v3/orders response."""
    purchaseOrderId: Optional[str] = None
    customerOrderId: Optional[str] = None
    customerEmailId: Optional[str] = None
    orderType: Optional[str] = None  # REGULAR, REPLACEMENT
    orderDate: Optional[int] = None  # epoch millis
    shippingInfo: Optional[WalmartShippingInfo] = None
    orderLines: Optional[dict] = None  # {"orderLine": [...]}

    class Config:
        extra = "allow"
