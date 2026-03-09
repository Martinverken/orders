import base64
import httpx
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.walmart import mapper
from models.order import OrderCreate

logger = logging.getLogger(__name__)

PAGE_SIZE = 200  # Walmart allows up to 10,000; 200 is a safe page size


class WalmartClient(BaseIntegration):
    """Walmart Marketplace integration using OAuth2 client_credentials.

    Auth docs: https://developer.walmart.com/global-marketplace/reference/tokenapi
    Orders docs: https://developer.walmart.com/cl-marketplace/reference/getallorders

    Walmart uses:
    - OAuth2 client_credentials for auth (token valid 15 min)
    - GET /v3/orders for order listing with cursor-based pagination
    - Epoch milliseconds for dates
    - Status per order line (Created, Acknowledged, Shipped, Delivered, Canceled)
    """

    def __init__(self):
        settings = get_settings()
        self.client_id = settings.walmart_client_id
        self.client_secret = settings.walmart_client_secret
        self.base_url = settings.walmart_base_url
        self._access_token: str | None = None
        self._token_expires_at: float = 0

        if not self.client_id or not self.client_secret:
            raise IntegrationError("walmart", "Missing walmart_client_id or walmart_client_secret")

    @property
    def source_name(self) -> str:
        return "walmart"

    async def _ensure_token(self, client: httpx.AsyncClient) -> str:
        """Get a valid access token, refreshing if needed."""
        now = time.time()
        if self._access_token and now < self._token_expires_at - 30:
            return self._access_token

        # Request new token via client_credentials
        credentials = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()

        try:
            response = await client.post(
                f"{self.base_url}/token",
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "WM_SVC.NAME": "Walmart Marketplace",
                    "WM_QOS.CORRELATION_ID": f"verken-{int(now)}",
                    "WM_MARKET": "cl",
                },
                content="grant_type=client_credentials",
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as e:
            raise IntegrationError(
                "walmart",
                f"Token request failed: HTTP {e.response.status_code}",
                e.response.status_code,
            )
        except Exception as e:
            raise IntegrationError("walmart", f"Token request error: {e}")

        self._access_token = data.get("access_token")
        expires_in = data.get("expires_in", 900)
        self._token_expires_at = now + expires_in

        if not self._access_token:
            raise IntegrationError("walmart", "No access_token in token response")

        logger.info(f"[walmart] Token refreshed, expires in {expires_in}s")
        return self._access_token

    def _build_headers(self, token: str) -> dict:
        return {
            "WM_SEC.ACCESS_TOKEN": token,
            "WM_SVC.NAME": "Walmart Marketplace",
            "WM_QOS.CORRELATION_ID": f"verken-{int(time.time())}",
            "WM_MARKET": "cl",
            "Accept": "application/json",
        }

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all actionable Walmart orders.

        Fetches orders with status Created and Acknowledged (actionable for seller).
        Also fetches Shipped to track recently shipped orders for cleanup.
        Uses cursor-based pagination.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            token = await self._ensure_token(client)

            # Walmart Chile requires createdStartDate
            since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

            seen_ids: set[str] = set()  # Deduplicate across pages

            for wm_status in ("Created", "Acknowledged", "Shipped"):
                next_cursor: str | None = None
                page = 0

                while True:
                    params: dict = {
                        "limit": PAGE_SIZE,
                        "status": wm_status,
                        "productInfo": "true",
                        "createdStartDate": since,
                    }
                    if next_cursor:
                        params["nextCursor"] = next_cursor

                    url = f"{self.base_url}/orders"
                    logger.info(
                        f"[walmart] Fetching orders: status={wm_status} page={page}"
                    )

                    try:
                        response = await client.get(
                            url,
                            params=params,
                            headers=self._build_headers(token),
                        )
                        if response.status_code == 401:
                            token = await self._ensure_token(client)
                            response = await client.get(
                                url,
                                params=params,
                                headers=self._build_headers(token),
                            )
                        response.raise_for_status()
                        body = response.json()
                    except httpx.HTTPStatusError as e:
                        raise IntegrationError(
                            "walmart",
                            f"HTTP {e.response.status_code} fetching {wm_status} orders",
                            e.response.status_code,
                        )
                    except Exception as e:
                        raise IntegrationError("walmart", str(e))

                    list_obj = body.get("list") or {}
                    meta = list_obj.get("meta") or {}
                    elements = list_obj.get("elements") or {}
                    raw_orders = elements.get("order") or []

                    if isinstance(raw_orders, dict):
                        raw_orders = [raw_orders]

                    if not raw_orders:
                        break

                    new_on_page = 0
                    for raw_order in raw_orders:
                        po_id = raw_order.get("purchaseOrderId", "")
                        if po_id in seen_ids:
                            continue
                        seen_ids.add(po_id)
                        new_on_page += 1
                        order = mapper.to_order_create(raw_order)
                        if order:
                            yield order

                    # If all orders on this page were duplicates, stop paginating
                    if new_on_page == 0:
                        break

                    next_cursor = meta.get("nextCursor")
                    if not next_cursor:
                        break
                    page += 1
