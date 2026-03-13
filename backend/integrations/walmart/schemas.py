from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class WalmartOrderLineItem(BaseModel):
    """Product info nested inside an order line."""
    model_config = ConfigDict(extra="allow")

    productName: Optional[str] = None
    sku: Optional[str] = None


class WalmartOrderLineQuantity(BaseModel):
    model_config = ConfigDict(extra="allow")

    unitOfMeasurement: Optional[str] = None
    amount: Optional[str] = None


class WalmartOrderLineStatus(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: Optional[str] = None
    statusQuantity: Optional[WalmartOrderLineQuantity] = None
    trackingInfo: Optional[Any] = None


class WalmartOrderLine(BaseModel):
    """Single line item within a Walmart order."""
    model_config = ConfigDict(extra="allow")

    lineNumber: Optional[str] = None
    item: Optional[WalmartOrderLineItem] = None
    charges: Optional[list] = None
    orderLineQuantity: Optional[WalmartOrderLineQuantity] = None
    statusDate: Optional[int] = None  # epoch millis
    orderLineStatuses: Optional[list[WalmartOrderLineStatus]] = None
    fulfillment: Optional[dict] = None


class WalmartPostalAddress(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postalCode: Optional[str] = None
    country: Optional[str] = None
    addressType: Optional[str] = None


class WalmartShippingInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    phone: Optional[str] = None
    estimatedDeliveryDate: Optional[int] = None  # epoch millis
    estimatedShipDate: Optional[int] = None  # epoch millis
    methodCode: Optional[str] = None  # e.g. "Standard"
    postalAddress: Optional[WalmartPostalAddress] = None


class WalmartOrder(BaseModel):
    """Raw order from Walmart GET /v3/orders response."""
    model_config = ConfigDict(extra="allow")

    purchaseOrderId: Optional[str] = None
    customerOrderId: Optional[str] = None
    customerEmailId: Optional[str] = None
    orderType: Optional[str] = None  # REGULAR, REPLACEMENT
    orderDate: Optional[int] = None  # epoch millis
    shippingInfo: Optional[WalmartShippingInfo] = None
    orderLines: Optional[dict] = None  # {"orderLine": [...]}
