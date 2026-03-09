"""Paris (Cencosud) order schemas.

Based on real API response from developers.ecomm.cencosud.com.
Docs: https://developers.ecomm.cencosud.com/docs
"""

from pydantic import BaseModel
from typing import Optional, Any


class ParisStatus(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None

    class Config:
        extra = "allow"


class ParisItem(BaseModel):
    id: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    sellerSku: Optional[str] = None
    basePrice: Optional[str] = None
    grossPrice: Optional[str] = None
    priceAfterDiscounts: Optional[float] = None
    statusId: Optional[int] = None
    status: Optional[ParisStatus] = None
    imagePath: Optional[str] = None
    category: Optional[str] = None

    class Config:
        extra = "allow"


class ParisShippingAddress(BaseModel):
    id: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    address3: Optional[str] = None
    city: Optional[str] = None
    stateCode: Optional[str] = None
    countryCode: Optional[str] = None
    phone: Optional[str] = None
    communaCode: Optional[str] = None

    class Config:
        extra = "allow"


class ParisDeliveryOption(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None

    class Config:
        extra = "allow"


class ParisSubOrder(BaseModel):
    """A suborder represents a single shipment within an order."""
    id: Optional[int] = None
    orderId: Optional[str] = None
    subOrderNumber: Optional[str] = None
    statusId: Optional[int] = None
    carrier: Optional[str] = None
    trackingNumber: Optional[str] = None
    dispatchDate: Optional[str] = None          # promised dispatch date (YYYY-MM-DD)
    arrivalDate: Optional[str] = None           # promised arrival date
    arrivalDateEnd: Optional[str] = None
    effectiveDispatchDate: Optional[str] = None
    effectiveArrivalDate: Optional[str] = None
    effectiveManifestDate: Optional[str] = None
    updatedAt: Optional[str] = None
    fulfillment: Optional[str] = None
    status: Optional[ParisStatus] = None
    shippingAddress: Optional[ParisShippingAddress] = None
    deliveryOption: Optional[ParisDeliveryOption] = None
    items: Optional[list[ParisItem]] = None

    class Config:
        extra = "allow"


class ParisCustomer(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    documentType: Optional[str] = None
    documentNumber: Optional[str] = None

    class Config:
        extra = "allow"


class ParisOrder(BaseModel):
    """Raw order from Paris (Cencosud) API."""
    id: Optional[str] = None
    origin: Optional[str] = None
    originOrderNumber: Optional[str] = None
    originOrderDate: Optional[str] = None
    createdAt: Optional[str] = None
    customer: Optional[ParisCustomer] = None
    billingAddress: Optional[dict] = None
    subOrders: Optional[list[ParisSubOrder]] = None

    class Config:
        extra = "allow"
