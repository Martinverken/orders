"""Welivery delivery tracking API client.

Auth: Basic Auth (api_key, api_secret)
Endpoint: GET https://sistema.welivery.cl/api/delivery_status?Id={welivery_id}

The welivery_id is the Shopify order name without '#' (e.g. V15140, K3952).

Statuses:
    0  PENDIENTE
    1  EN CURSO
    2  NO COMPLETADO
    3  COMPLETADO        <- delivered to customer
    4  CANCELADO
    7  INGRESO A DEPOSITO
    9  REPETIDO
    10 PREPARADO
    11 PRIMER VISITA
    12 SEGUNDA VISITA
    13 DEBE REGRESAR
    15 ASIGNADO
    19 REGRESADO
    20 NO RETIRADO
    21 RETIRADO
    23 SINIESTRO
    98 INDEFINIDO
    99 SIN PROCESAR

When status is COMPLETADO, the response includes:
    - DeliveryDate: actual delivery date
    - Comprobante: URL to delivery receipt PDF
"""
import os
import logging
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger(__name__)

WELIVERY_BASE_URL = os.getenv("WELIVERY_BASE_URL", "https://sistema.welivery.cl")
WELIVERY_API_KEY = os.getenv("WELIVERY_API_KEY", "674f3c2c1a8a6f90461e8a66fb5550ba")
WELIVERY_API_SECRET = os.getenv("WELIVERY_API_SECRET", "273287c149f3dedf855611de427b34f4ede7355d")

_SANTIAGO = ZoneInfo("America/Santiago")


@dataclass
class WeliveryStatus:
    """Parsed delivery status from Welivery API."""
    welivery_id: str
    status: str                           # e.g. "COMPLETADO", "EN CURSO"
    delivered: bool                        # True if status == "COMPLETADO"
    delivered_at: datetime | None          # from DeliveryDate or status_history
    depot_at: datetime | None             # when package arrived at Welivery depot (INGRESO A DEPOSITO)
    comprobante_url: str | None           # PDF receipt URL
    tracking_url: str | None
    comments: str | None
    raw: dict                             # full API response


def _parse_delivery_date(data: dict) -> datetime | None:
    """Extract the actual delivery datetime.

    Priority:
    1. DeliveryDate field (if non-empty)
    2. Last COMPLETADO entry in status_history
    """
    dd = data.get("DeliveryDate", "")
    if dd:
        try:
            dt = datetime.strptime(dd, "%Y-%m-%d %H:%M:%S")
            return dt.replace(tzinfo=_SANTIAGO)
        except ValueError:
            pass
        try:
            dt = datetime.strptime(dd, "%Y-%m-%d")
            return dt.replace(tzinfo=_SANTIAGO)
        except ValueError:
            pass

    # Fallback: find last COMPLETADO in status_history
    history = data.get("status_history") or []
    for entry in reversed(history):
        if entry.get("estado", "").upper() == "COMPLETADO":
            dt_str = entry.get("date_time", "")
            if dt_str:
                try:
                    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
                    return dt.replace(tzinfo=_SANTIAGO)
                except ValueError:
                    pass
    return None


def _parse_depot_date(data: dict) -> datetime | None:
    """Extract when the package arrived at Welivery's distribution center.

    Looks for "INGRESO A DEPOSITO" status in status_history.
    """
    history = data.get("status_history") or []
    for entry in history:
        if entry.get("estado", "").upper() == "INGRESO A DEPOSITO":
            dt_str = entry.get("date_time", "")
            if dt_str:
                try:
                    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
                    return dt.replace(tzinfo=_SANTIAGO)
                except ValueError:
                    pass
    return None


def _call_api(order_id: str, timeout: int = 15) -> dict | None:
    """Call Welivery API and return the inner data dict, or None on error."""
    try:
        url = f"{WELIVERY_BASE_URL}/api/delivery_status"
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(
                url,
                params={"Id": order_id},
                auth=(WELIVERY_API_KEY, WELIVERY_API_SECRET),
            )
            resp.raise_for_status()
            body = resp.json()
            if body.get("status") == "OK":
                return body.get("data") or {}
            logger.warning(f"[welivery] Non-OK response for {order_id}: {body}")
            return None
    except Exception as e:
        logger.warning(f"[welivery] API error for {order_id}: {e}")
        return None


def get_delivery_status(order_id: str) -> WeliveryStatus | None:
    """Query Welivery API for delivery status of a single order.

    Args:
        order_id: Welivery reference ID (Shopify order name without '#', e.g. "V15140")

    Returns:
        WeliveryStatus or None if the API call fails.
    """
    data = _call_api(order_id)
    if data is None:
        return None

    status_text = str(data.get("Status", "")).strip().upper()
    is_delivered = status_text == "COMPLETADO"
    delivered_at = _parse_delivery_date(data) if is_delivered else None
    depot_at = _parse_depot_date(data)

    return WeliveryStatus(
        welivery_id=order_id,
        status=status_text,
        delivered=is_delivered,
        delivered_at=delivered_at,
        depot_at=depot_at,
        comprobante_url=data.get("Comprobante") or None,
        tracking_url=data.get("TrackingUrl") or None,
        comments=data.get("Comments") or None,
        raw=data,
    )


def get_comprobante(order_id: str) -> str | None:
    """Fetch proof of delivery (comprobante) URL from Welivery.

    Returns the comprobante URL if the order status is COMPLETADO, None otherwise.
    """
    data = _call_api(order_id)
    if data is None:
        return None
    if str(data.get("Status", "")).strip().upper() == "COMPLETADO":
        return data.get("Comprobante") or None
    return None


def get_delivery_statuses(order_ids: list[str]) -> dict[str, WeliveryStatus]:
    """Query Welivery API for multiple orders. Returns {order_id: WeliveryStatus}."""
    results = {}
    for oid in order_ids:
        status = get_delivery_status(oid)
        if status:
            results[oid] = status
    return results
