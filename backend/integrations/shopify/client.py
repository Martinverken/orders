"""Shopify Admin REST API client.

Fetches paid orders with tags 'ebox' + ('welivery' | 'SKN').
fulfillment_status=fulfilled in Shopify means "handed to courier" (Welivery/Starken).
Same as Falabella Regular: shipped = terminal (our responsibility ends).

Only fetches orders created in the last LOOKBACK_DAYS days to avoid importing
old historical orders. New orders are picked up each sync cycle.
"""
import logging
from datetime import datetime, timedelta
from typing import AsyncIterator
from zoneinfo import ZoneInfo

import httpx

from integrations.base import BaseIntegration, IntegrationError
from integrations.shopify.mapper import to_order_creates
from models.order import OrderCreate

logger = logging.getLogger(__name__)

_API_VERSION = "2024-01"
_LOOKBACK_DAYS = 14  # Only fetch orders from the last 14 days


class ShopifyClient(BaseIntegration):
    def __init__(self, store_url: str, access_token: str, source_name: str):
        if not store_url or not access_token:
            raise IntegrationError(source_name, f"store_url and access_token must be set for {source_name}")
        self._source_name = source_name
        self.base_url = f"https://{store_url}/admin/api/{_API_VERSION}"
        self.headers = {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }

    @property
    def source_name(self) -> str:
        return self._source_name

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all eligible Shopify orders not yet delivered."""
        url = f"{self.base_url}/orders.json"
        since = datetime.now(ZoneInfo("America/Santiago")) - timedelta(days=_LOOKBACK_DAYS)
        params = {
            "financial_status": "paid",
            "status": "any",
            "limit": 250,
            "created_at_min": since.isoformat(),
            "fields": "id,name,order_number,tags,financial_status,fulfillment_status,created_at,line_items,shipping_address,fulfillments",
        }

        fetched = 0
        skipped_ineligible = 0

        with httpx.Client(timeout=30) as client:
            while url:
                try:
                    resp = client.get(url, headers=self.headers, params=params if params else None)
                    resp.raise_for_status()
                except httpx.HTTPStatusError as e:
                    raise IntegrationError(self._source_name, f"HTTP {e.response.status_code}: {e.response.text}")
                except httpx.RequestError as e:
                    raise IntegrationError(self._source_name, f"Request error: {e}")

                data = resp.json()
                orders = data.get("orders") or []

                for raw in orders:
                    fetched += 1
                    results = to_order_creates(raw, source=self._source_name)
                    if not results:
                        skipped_ineligible += 1
                        continue

                    for order in results:
                        yield order

                # Cursor-based pagination via Link header
                link_header = resp.headers.get("Link", "")
                url = _parse_next_link(link_header)
                params = None  # params are already encoded in the next URL

        logger.info(
            f"[{self._source_name}] Fetched {fetched} orders total: "
            f"{fetched - skipped_ineligible} eligible, "
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
