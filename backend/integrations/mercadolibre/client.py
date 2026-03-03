import httpx
import logging
from typing import AsyncIterator

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.mercadolibre import mapper
from models.order import OrderCreate

logger = logging.getLogger(__name__)

ML_BASE_URL = "https://api.mercadolibre.com"
PAGE_SIZE = 50

# Statuses we care about for delivery monitoring
PENDING_STATUSES = ["paid"]


class MercadoLibreClient(BaseIntegration):
    def __init__(self):
        settings = get_settings()
        self.access_token = settings.mercadolibre_access_token
        self.seller_id = settings.mercadolibre_seller_id

    @property
    def source_name(self) -> str:
        return "mercadolibre"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.access_token}"}

    async def _get_shipment_detail(self, client: httpx.AsyncClient, shipment_id: int) -> dict | None:
        """Fetch /shipments/{id} to get logistic_type and estimated delivery."""
        try:
            resp = await client.get(
                f"{ML_BASE_URL}/shipments/{shipment_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.warning(f"Could not fetch ML shipment {shipment_id}: {e}")
            return None

    async def fetch_pending_orders(self) -> AsyncIterator[OrderCreate]:
        """Yield OrderCreate for all pending ML orders with their shipment details."""
        if not self.access_token or not self.seller_id:
            logger.warning("Mercado Libre credentials not configured — skipping")
            return

        async with httpx.AsyncClient(timeout=30.0) as client:
            for status in PENDING_STATUSES:
                offset = 0
                while True:
                    url = f"{ML_BASE_URL}/orders/search"
                    params = {
                        "seller": self.seller_id,
                        "order.status": status,
                        "limit": PAGE_SIZE,
                        "offset": offset,
                    }
                    logger.info(f"Fetching ML orders: status={status} offset={offset}")
                    try:
                        resp = await client.get(url, params=params, headers=self._headers())
                        resp.raise_for_status()
                        body = resp.json()
                    except httpx.HTTPStatusError as e:
                        raise IntegrationError(
                            "mercadolibre",
                            f"HTTP {e.response.status_code}",
                            e.response.status_code,
                        )
                    except Exception as e:
                        raise IntegrationError("mercadolibre", str(e))

                    results = body.get("results", [])
                    if not results:
                        break

                    for order_raw in results:
                        shipment_raw = None
                        shipping = order_raw.get("shipping") or {}
                        shipment_id = shipping.get("id")
                        if shipment_id:
                            shipment_raw = await self._get_shipment_detail(client, shipment_id)

                        order = mapper.to_order_create(order_raw, shipment_raw)
                        if order:
                            yield order

                    paging = body.get("paging", {})
                    total = paging.get("total", 0)
                    if offset + PAGE_SIZE >= total:
                        break
                    offset += PAGE_SIZE
