import logging

import httpx
from fastapi import APIRouter, HTTPException

from config import get_settings
from integrations.mercadolibre.client import MercadoLibreClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml", tags=["mercadolibre"])


@router.get("/reputation")
def get_ml_reputation():
    """Return current seller reputation from MercadoLibre."""
    settings = get_settings()
    if not settings.mercadolibre_seller_id:
        raise HTTPException(status_code=503, detail="ML seller_id no configurado")

    client = MercadoLibreClient()
    if client.refresh_token:
        client._refresh_access_token()

    if not client.access_token:
        raise HTTPException(status_code=503, detail="ML access_token no disponible")

    try:
        resp = httpx.get(
            f"https://api.mercadolibre.com/users/{settings.mercadolibre_seller_id}",
            headers={"Authorization": f"Bearer {client.access_token}"},
            timeout=10.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Error ML API: {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    data = resp.json()
    rep = data.get("seller_reputation") or {}
    metrics = rep.get("metrics") or {}

    def _metric(key: str) -> dict:
        m = metrics.get(key) or {}
        return {"rate": m.get("rate"), "value": m.get("value"), "period": m.get("period")}

    return {
        "level_id": rep.get("level_id"),
        "power_seller_status": rep.get("power_seller_status"),
        "transactions_completed": (rep.get("transactions") or {}).get("completed"),
        # Envíos tardíos (delayed_handling_time = gestión fuera de plazo)
        "delayed_rate": _metric("delayed_handling_time")["rate"],
        "delayed_value": _metric("delayed_handling_time")["value"],
        # Reclamos
        "claims_rate": _metric("claims")["rate"],
        "claims_value": _metric("claims")["value"],
        # Mediaciones
        "mediations_rate": _metric("mediations")["rate"],
        "mediations_value": _metric("mediations")["value"],
        # Canceladas por el vendedor
        "cancellations_rate": _metric("cancellations")["rate"],
        "cancellations_value": _metric("cancellations")["value"],
    }
