"""Paris (Cencosud) marketplace integration.

Auth: Bearer token (API key from Cencosud Developer Portal)
Orders endpoint: GET /v1/orders
Pagination: offset-based, response has {"data": [...], "count": N}
Shipping: Standard only, identical to Falabella Regular

Docs: https://developers.ecomm.cencosud.com/docs
"""

import httpx
import logging
from datetime import datetime, timedelta
from typing import AsyncIterator
from zoneinfo import ZoneInfo

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.paris import mapper
from models.order import OrderCreate

logger = logging.getLogger(__name__)

PAGE_SIZE = 100
_LOOKBACK_DAYS = 30


class ParisClient(BaseIntegration):
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.paris_api_key
        self.base_url = settings.paris_base_url

        if not self.api_key:
            raise IntegrationError("paris", "Missing paris_api_key")

    @property
    def source_name(self) -> str:
        return "paris"

    def _build_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all actionable Paris orders.

        Fetches orders created in the last LOOKBACK_DAYS days.
        Filters by subOrder status in the mapper.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            since = (datetime.now(ZoneInfo("America/Santiago")) - timedelta(days=_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

            offset = 0
            while True:
                url = f"{self.base_url}/orders"
                params = {
                    "limit": PAGE_SIZE,
                    "offset": offset,
                    "gteCreatedAt": since,
                }

                logger.info(f"[paris] Fetching orders: offset={offset}")

                try:
                    response = await client.get(
                        url,
                        params=params,
                        headers=self._build_headers(),
                    )
                    response.raise_for_status()
                    body = response.json()
                except httpx.HTTPStatusError as e:
                    raise IntegrationError(
                        "paris",
                        f"HTTP {e.response.status_code} fetching orders",
                        e.response.status_code,
                    )
                except Exception as e:
                    raise IntegrationError("paris", str(e))

                # Response envelope: {"data": [...], "count": N}
                raw_orders = body.get("data") or []
                if isinstance(raw_orders, dict):
                    raw_orders = [raw_orders]

                if not raw_orders:
                    break

                for raw_order in raw_orders:
                    for order in mapper.to_order_creates(raw_order):
                        yield order

                # Check if more pages exist
                total_count = body.get("count") or 0
                offset += PAGE_SIZE
                if offset >= total_count:
                    break
