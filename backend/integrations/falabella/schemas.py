from pydantic import BaseModel, ConfigDict
from typing import Optional, Any


class FalabellaOrderItem(BaseModel):
    """Raw order item from Falabella GetOrderItems response."""
    OrderItemId: Optional[str] = None
    OrderId: Optional[str] = None
    ShopId: Optional[str] = None
    Name: Optional[str] = None
    Sku: Optional[str] = None
    Variation: Optional[str] = None
    ShopSku: Optional[str] = None
    Status: Optional[str] = None
    CreatedAt: Optional[str] = None
    UpdatedAt: Optional[str] = None
    PurchaseOrderId: Optional[str] = None
    PurchaseOrderNumber: Optional[str] = None
    PromisedShippingTime: Optional[str] = None
    TrackingCode: Optional[str] = None
    ShippingProviderType: Optional[str] = None
    ShippingProvider: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class FalabellaOrder(BaseModel):
    """Raw order from Falabella GetOrders response."""
    OrderId: Optional[str] = None
    CustomerFirstName: Optional[str] = None
    CustomerLastName: Optional[str] = None
    OrderNumber: Optional[str] = None
    PaymentMethod: Optional[str] = None
    Remarks: Optional[str] = None
    DeliveryInfo: Optional[str] = None
    ShippingType: Optional[str] = None
    ShippingProvider: Optional[str] = None
    TrackingCode: Optional[str] = None
    Price: Optional[str] = None
    GiftOption: Optional[str] = None
    GiftMessage: Optional[str] = None
    VoucherCode: Optional[str] = None
    CreatedAt: Optional[str] = None
    UpdatedAt: Optional[str] = None
    AddressUpdatedAt: Optional[str] = None
    Statuses: Optional[Any] = None
    # Delivery deadline — the key field we track
    # May appear as limit_delivery_date or PromisedShippingDate depending on API version
    limit_delivery_date: Optional[str] = None
    PromisedShippingDate: Optional[str] = None

    model_config = ConfigDict(extra="allow")
