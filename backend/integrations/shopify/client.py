"""Shopify Admin REST API client.

Fetches paid orders with tags 'ebox' + 'welivery'.
Uses Shopify's own fulfillment_status to detect delivered orders.
"""
import logging
from typing import AsyncIterator

import httpx

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.shopify.mapper import to_order_create
from models.order import OrderCreate

logger = logging.getLogger(__name__)

_API_VERSION = "2024-01"


class ShopifyClient(BaseIntegration):
    def __init__(self):
        settings = get_settings()
        if not settings.shopify_store_url or not settings.shopify_access_token:
            raise IntegrationError("shopify", "SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set")
        self.base_url = f"https://{settings.shopify_store_url}/admin/api/{_API_VERSION}"
        self.headers = {
            "X-Shopify-Access-Token": settings.shopify_access_token,
            "Content-Type": "application/json",
        }

    @property
    def source_name(self) -> str:
        return "shopify"

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all eligible Shopify orders not yet delivered."""
        url = f"{self.base_url}/orders.json"
        params = {
            "financial_status": "paid",
            "status": "any",
            "limit": 250,
            "fields": "id,name,order_number,tags,financial_status,fulfillment_status,created_at,line_items,shipping_address",
        }

        fetched = 0
        skipped_ineligible = 0
        skipped_delivered = 0

        with httpx.Client(timeout=30) as client:
            while url:
                try:
                    resp = client.get(url, headers=self.headers, params=params if params else None)
                    resp.raise_for_status()
                except httpx.HTTPStatusError as e:
                    raise IntegrationError("shopify", f"HTTP {e.response.status_code}: {e.response.text}")
                except httpx.RequestError as e:
                    raise IntegrationError("shopify", f"Request error: {e}")

                data = resp.json()
                orders = data.get("orders") or []

                for raw in orders:
                    fetched += 1
                    mapped = to_order_create(raw)
                    if mapped is None:
                        skipped_ineligible += 1
                        continue

                    # Skip orders already fulfilled in Shopify — left_feed logic archives them
                    if raw.get("fulfillment_status") == "fulfilled":
                        skipped_delivered += 1
                        continue

                    yield mapped

                # Cursor-based pagination via Link header
                link_header = resp.headers.get("Link", "")
                url = _parse_next_link(link_header)
                params = None  # params are already encoded in the next URL

        logger.info(
            f"[shopify] Fetched {fetched} orders total: "
            f"{fetched - skipped_ineligible - skipped_delivered} pending, "
            f"{skipped_delivered} delivered, "
            f"{skipped_ineligible} ineligible"
        )


def _parse_next_link(link_header: str) -> str | None:
    """Parse Shopify's Link header for the next page URL.

    Format: <https://...?page_info=...>; rel="next", <...>; rel="previous"
    """
    if not link_header:
        return None
    for part in link_header.split(","):
        part = part.strip()
        if 'rel="next"' in part:
            # Extract URL between < and >
            start = part.find("<")
            end = part.find(">")
            if start != -1 and end != -1:
                return part[start + 1:end]
    return None
