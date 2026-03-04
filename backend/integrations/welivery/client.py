import os
import logging
import httpx

logger = logging.getLogger(__name__)

WELIVERY_BASE_URL = os.getenv("WELIVERY_BASE_URL", "https://sistema.welivery.cl")
WELIVERY_API_KEY = os.getenv("WELIVERY_API_KEY", "674f3c2c1a8a6f90461e8a66fb5550ba")
WELIVERY_API_SECRET = os.getenv("WELIVERY_API_SECRET", "273287c149f3dedf855611de427b34f4ede7355d")


def get_delivery_status(order_id: str) -> dict:
    """Check Welivery delivery status for a given order ID.

    Returns:
        {"delivered": bool, "raw_status": dict}

    "delivered" is True only when Status == "COMPLETADO" (case-insensitive).
    On any API error returns {"delivered": False, "raw_status": {}}.
    """
    try:
        url = f"{WELIVERY_BASE_URL}/api/delivery_status"
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                url,
                params={"Id": order_id},
                auth=(WELIVERY_API_KEY, WELIVERY_API_SECRET),
            )
            resp.raise_for_status()
            data = resp.json()
            inner: dict = {}
            if data.get("status") == "OK":
                inner = data.get("data") or {}
            status_text = str(inner.get("Status", "")).strip().upper()
            delivered = status_text == "COMPLETADO"
            return {"delivered": delivered, "raw_status": inner}
    except Exception as e:
        logger.warning(f"Welivery status check failed for order {order_id}: {e}")
        return {"delivered": False, "raw_status": {}}


def get_comprobante(order_id: str) -> str | None:
    """Fetch proof of delivery (comprobante) from Welivery for a given order ID.

    Returns the comprobante URL if the order status is COMPLETADO, None otherwise.
    """
    try:
        url = f"{WELIVERY_BASE_URL}/api/delivery_status"
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                url,
                params={"Id": order_id},
                auth=(WELIVERY_API_KEY, WELIVERY_API_SECRET),
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "OK":
                inner = data.get("data") or {}
                if inner.get("Status") == "COMPLETADO":
                    return inner.get("Comprobante") or None
    except Exception as e:
        logger.warning(f"Welivery API error for order {order_id}: {e}")
    return None
