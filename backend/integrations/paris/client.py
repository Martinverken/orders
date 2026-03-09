"""Paris (Cencosud) marketplace integration.

STUB: The Cencosud Developer Portal (developers.ecomm.cencosud.com) is JS-rendered
and its API reference could not be fully scraped. This client implements the
BaseIntegration interface with placeholder API calls that need to be completed
once the actual API documentation is available.

What we know:
- Platform: Cencosud Seller Center (developers.ecomm.cencosud.com)
- Auth: likely API key or OAuth2 (TBD)
- Shipping: Standard only, identical to Falabella Regular
  (carrier picks up, deadline = handoff to carrier)

TODO:
1. Confirm authentication method (API key, OAuth2, HMAC?)
2. Confirm base URL for production API
3. Confirm GET orders endpoint path and parameters
4. Confirm order response schema field names
5. Confirm pagination mechanism (offset, cursor, page?)
6. Confirm order statuses used by Paris

Docs: https://developers.ecomm.cencosud.com/docs
"""

import httpx
import logging
from typing import AsyncIterator

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.paris import mapper
from models.order import OrderCreate

logger = logging.getLogger(__name__)

PAGE_SIZE = 100


class ParisClient(BaseIntegration):
    """Paris (Cencosud) Seller Center integration.

    STUB: API calls are placeholders. See module docstring for TODO items.
    """

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
        """Build request headers.

        TODO: Confirm actual auth header format from Cencosud docs.
        Common patterns: Bearer token, X-API-Key, or HMAC signature.
        """
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all actionable Paris orders.

        TODO: Replace placeholder endpoint with actual Cencosud API path.
        Expected flow (based on Seller Center patterns):
        1. Fetch orders with status pending/ready_to_ship/shipped
        2. Paginate through results
        3. Map each order to OrderCreate via mapper
        """
        # TODO: Confirm actual statuses used by Paris API
        statuses = ["pending", "ready_to_ship", "shipped"]

        async with httpx.AsyncClient(timeout=30.0) as client:
            for status in statuses:
                offset = 0
                while True:
                    # TODO: Replace with actual Cencosud API endpoint
                    # Possible patterns:
                    #   GET /api/v1/orders?status={status}&limit={limit}&offset={offset}
                    #   GET /api/orders?Status={status}&Limit={limit}&Offset={offset}
                    url = f"{self.base_url}/api/v1/orders"
                    params = {
                        "status": status,
                        "limit": PAGE_SIZE,
                        "offset": offset,
                    }

                    logger.info(f"[paris] Fetching orders: status={status} offset={offset}")

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
                            f"HTTP {e.response.status_code} fetching {status} orders",
                            e.response.status_code,
                        )
                    except Exception as e:
                        raise IntegrationError("paris", str(e))

                    # TODO: Adjust response envelope navigation
                    # Common patterns: body["orders"], body["data"], body["items"]
                    raw_orders = body.get("orders") or body.get("data") or []
                    if isinstance(raw_orders, dict):
                        raw_orders = [raw_orders]

                    if not raw_orders:
                        break

                    for raw_order in raw_orders:
                        order = mapper.to_order_create(raw_order)
                        if order:
                            yield order

                    if len(raw_orders) < PAGE_SIZE:
                        break
                    offset += PAGE_SIZE
