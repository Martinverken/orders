import hmac
import hashlib
import httpx
import logging
from datetime import datetime, timezone
from typing import AsyncIterator
from urllib.parse import quote

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.falabella import mapper
from models.order import OrderCreate

logger = logging.getLogger(__name__)

# Statuses considered "pending" / actionable for delivery monitoring
# "delivered" is included so direct orders (falaflex) are captured at the exact moment
# of delivery — their UpdatedAt at that point is used as the date_delivered proxy.
PENDING_STATUSES = [
    "pending",
    "ready_to_ship",
    "shipped",
    "delivered",
]

PAGE_SIZE = 100


class FalabellaClient(BaseIntegration):
    def __init__(self):
        settings = get_settings()
        self.user_id = settings.falabella_user_id
        self.api_key = settings.falabella_api_key
        self.base_url = settings.falabella_base_url

    @property
    def source_name(self) -> str:
        return "falabella"

    def _build_signed_url(self, action: str, extra_params: dict) -> str:
        """Build a HMAC-SHA256 signed URL for the Falabella Seller Center API.

        Values must be URL-encoded (safe="") before computing the signature,
        otherwise characters like @, + and : cause a signature mismatch (E007).
        """
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
        params = {
            "Action": action,
            "Format": "JSON",
            "Timestamp": timestamp,
            "UserID": self.user_id,
            "Version": "1.0",
            **{k: str(v) for k, v in extra_params.items()},
        }
        sorted_keys = sorted(params.keys())
        # URL-encode every value (safe="") — required for correct signature
        query_string = "&".join(
            f"{k}={quote(str(params[k]), safe='')}" for k in sorted_keys
        )
        signature = hmac.new(
            self.api_key.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return f"{self.base_url}/?{query_string}&Signature={signature}"

    def _extract_orders_from_response(self, body: dict) -> list[dict]:
        """Navigate the Falabella JSON envelope to reach the orders list."""
        try:
            orders_node = (
                body.get("SuccessResponse", {})
                .get("Body", {})
                .get("Orders", {})
                .get("Order", [])
            )
            if isinstance(orders_node, dict):
                # Single order returned as dict instead of list
                return [orders_node]
            return orders_node or []
        except Exception:
            return []

    async def _fetch_order_items(self, client: httpx.AsyncClient, order_id: str) -> list[dict]:
        """Fetch items for a single order to get TrackingCode and ShippingProviderType."""
        url = self._build_signed_url("GetOrderItems", {"OrderId": order_id})
        try:
            response = await client.get(url)
            response.raise_for_status()
            body = response.json()
            items_node = (
                body.get("SuccessResponse", {})
                .get("Body", {})
                .get("OrderItems", {})
                .get("OrderItem", [])
            )
            if isinstance(items_node, dict):
                return [items_node]
            return items_node or []
        except Exception as e:
            logger.warning(f"Could not fetch items for order {order_id}: {e}")
            return []

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all pending orders, paginating through all results."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            for status in PENDING_STATUSES:
                offset = 0
                while True:
                    extra: dict = {"Status": status, "Limit": PAGE_SIZE, "Offset": offset}
                    # 'delivered' has no natural recency filter — without CreatedAfter it
                    # would return the entire order history and time out.
                    if status == "delivered":
                        extra["CreatedAfter"] = "2026-03-01T00:00:00+00:00"
                    url = self._build_signed_url("GetOrders", extra)
                    logger.info(f"Fetching Falabella orders: status={status} offset={offset}")
                    try:
                        response = await client.get(url)
                        response.raise_for_status()
                        body = response.json()
                    except httpx.HTTPStatusError as e:
                        raise IntegrationError(
                            "falabella",
                            f"HTTP {e.response.status_code} fetching {status} orders",
                            e.response.status_code,
                        )
                    except Exception as e:
                        raise IntegrationError("falabella", str(e))

                    # Check for API-level errors
                    if "ErrorResponse" in body:
                        error_msg = (
                            body["ErrorResponse"]
                            .get("Head", {})
                            .get("ErrorMessage", "Unknown error")
                        )
                        raise IntegrationError("falabella", f"API error: {error_msg}")

                    raw_orders = self._extract_orders_from_response(body)
                    if not raw_orders:
                        break

                    for raw_order in raw_orders:
                        # Enrich order with items data (TrackingCode, ShippingProviderType)
                        order_id = raw_order.get("OrderId", "")
                        if order_id:
                            items = await self._fetch_order_items(client, order_id)
                            if items:
                                first = items[0]
                                # Flatten key fields to order level for easy access
                                raw_order["TrackingCode"] = (
                                    first.get("TrackingCode") or raw_order.get("TrackingCode", "")
                                )
                                raw_order["ShippingProviderType"] = first.get("ShippingProviderType", "")
                                raw_order["ShippingProvider"] = (
                                    first.get("ShippingProvider")
                                    or first.get("ShipmentProvider")
                                    or raw_order.get("ShippingProvider", "")
                                )
                                raw_order["_items"] = items

                        for order in mapper.to_order_creates(raw_order):
                            yield order

                    if len(raw_orders) < PAGE_SIZE:
                        break  # Last page
                    offset += PAGE_SIZE
