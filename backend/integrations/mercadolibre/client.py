import httpx
import logging
from typing import AsyncIterator

from config import get_settings
from integrations.base import BaseIntegration, IntegrationError
from integrations.mercadolibre import mapper
from models.order import OrderCreate

logger = logging.getLogger(__name__)

ML_BASE_URL = "https://api.mercadolibre.com"
TOKEN_URL = "https://api.mercadolibre.com/oauth/token"
PAGE_SIZE = 50

PENDING_STATUSES = ["paid"]


class MercadoLibreClient(BaseIntegration):
    def __init__(self):
        settings = get_settings()
        self.access_token = settings.mercadolibre_access_token
        self.refresh_token = settings.mercadolibre_refresh_token
        self.client_id = settings.mercadolibre_client_id
        self.client_secret = settings.mercadolibre_client_secret
        self.seller_id = settings.mercadolibre_seller_id

    @property
    def source_name(self) -> str:
        return "mercadolibre"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.access_token}"}

    def _refresh_access_token(self) -> bool:
        """Renueva el access_token usando el refresh_token (long-lived).
        Actualiza self.access_token en memoria para la sesión actual.
        El refresh_token de ML también rota — se actualiza en self.refresh_token.
        """
        if not self.refresh_token or not self.client_id or not self.client_secret:
            logger.warning("ML: no hay credenciales suficientes para renovar el token")
            return False
        try:
            resp = httpx.post(
                TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            self.access_token = data["access_token"]
            self.refresh_token = data.get("refresh_token", self.refresh_token)
            logger.info("ML access_token renovado correctamente")
            return True
        except Exception as e:
            logger.error(f"Error renovando ML access_token: {e}")
            return False

    async def get_shipment_status(self, shipment_id: int) -> dict | None:
        """Fetch current shipment status for an archived order (uses existing auth token)."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            return await self._get_shipment_detail(client, shipment_id)

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
        if not self.seller_id:
            logger.warning("Mercado Libre seller_id no configurado — saltando")
            return

        # Renueva el token al inicio de cada sync. El access_token dura 6h;
        # renovando siempre garantizamos que no expira durante el ciclo.
        if self.refresh_token:
            self._refresh_access_token()

        if not self.access_token:
            logger.warning("Mercado Libre sin access_token válido — saltando")
            return

        async with httpx.AsyncClient(timeout=30.0) as client:
            for status in PENDING_STATUSES:
                offset = 0
                while True:
                    url = f"{ML_BASE_URL}/orders/search"
                    params = {
                        "seller": self.seller_id,
                        "order.status": status,
                        "order.date_created.from": "2026-03-01T00:00:00.000-03:00",
                        "limit": PAGE_SIZE,
                        "offset": offset,
                    }
                    logger.info(f"Fetching ML orders: status={status} offset={offset}")
                    try:
                        resp = await client.get(url, params=params, headers=self._headers())
                        # Si el token expiró a mitad del sync, renovar y reintentar
                        if resp.status_code == 401 and self._refresh_access_token():
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
