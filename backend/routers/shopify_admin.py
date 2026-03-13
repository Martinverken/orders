"""Shopify Admin API — product creation endpoint."""
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shopify", tags=["shopify-admin"])

_API_VERSION = "2024-01"


class ShopifyProductCreate(BaseModel):
    brand: Literal["verken", "kaut"]
    name: str
    sku: str


class ShopifyProductResponse(BaseModel):
    shopify_product_id: str
    shopify_variant_id: str
    sku: str
    name: str
    shopify_url: str


@router.post("/create-product", response_model=ShopifyProductResponse)
def create_shopify_product(body: ShopifyProductCreate):
    settings = get_settings()
    if body.brand == "verken":
        store_url = settings.shopify_verken_url
        token = settings.shopify_verken_token
    else:
        store_url = settings.shopify_kaut_url
        token = settings.shopify_kaut_token

    if not store_url or not token:
        raise HTTPException(
            status_code=503,
            detail=f"Shopify credentials not configured for brand '{body.brand}'",
        )

    payload = {
        "product": {
            "title": body.name,
            "variants": [
                {
                    "sku": body.sku,
                    "price": "0.00",
                    "inventory_management": "shopify",
                }
            ],
            "status": "draft",
        }
    }

    url = f"https://{store_url}/admin/api/{_API_VERSION}/products.json"
    headers = {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }

    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=20)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"Shopify create product error: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Shopify error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Shopify request error: {e}")

    data = resp.json().get("product", {})
    product_id = str(data.get("id", ""))
    variant = (data.get("variants") or [{}])[0]
    variant_id = str(variant.get("id", ""))
    admin_url = f"https://{store_url}/admin/products/{product_id}"

    return ShopifyProductResponse(
        shopify_product_id=product_id,
        shopify_variant_id=variant_id,
        sku=body.sku,
        name=body.name,
        shopify_url=admin_url,
    )
