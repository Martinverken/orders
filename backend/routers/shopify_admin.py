"""Shopify Admin API — product creation and SKU suggestion endpoints."""
import json
import logging
from typing import Literal, Optional

import anthropic
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/shopify", tags=["shopify-admin"])

_API_VERSION = "2024-01"


class ShopifyProductCreate(BaseModel):
    brand: Literal["verken", "kaut"]
    name: str
    sku: str


class ShopifyProductResponse(BaseModel):
    shopify_product_id: str
    shopify_variant_id: str
    sku: str
    name: str
    shopify_url: str


@router.post("/create-product", response_model=ShopifyProductResponse)
def create_shopify_product(body: ShopifyProductCreate):
    settings = get_settings()
    if body.brand == "verken":
        store_url = settings.shopify_verken_url
        token = settings.shopify_verken_token
    else:
        store_url = settings.shopify_kaut_url
        token = settings.shopify_kaut_token

    if not store_url or not token:
        raise HTTPException(
            status_code=503,
            detail=f"Shopify credentials not configured for brand '{body.brand}'",
        )

    payload = {
        "product": {
            "title": body.name,
            "variants": [
                {
                    "sku": body.sku,
                    "price": "0.00",
                    "inventory_management": "shopify",
                }
            ],
            "status": "draft",
        }
    }

    url = f"https://{store_url}/admin/api/{_API_VERSION}/products.json"
    headers = {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }

    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=20)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error(f"Shopify create product error: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail=f"Shopify error: {e.response.text}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Shopify request error: {e}")

    data = resp.json().get("product", {})
    product_id = str(data.get("id", ""))
    variant = (data.get("variants") or [{}])[0]
    variant_id = str(variant.get("id", ""))
    admin_url = f"https://{store_url}/admin/products/{product_id}"

    return ShopifyProductResponse(
        shopify_product_id=product_id,
        shopify_variant_id=variant_id,
        sku=body.sku,
        name=body.name,
        shopify_url=admin_url,
    )


# ── SKU suggestion ────────────────────────────────────────────────────────────

class SkuSuggestRequest(BaseModel):
    prefix: str                        # New category prefix, e.g. "HUM"
    product_name: str                  # e.g. "Humidificador ultrasónico 4L"
    brand: str                         # "verken" or "kaut"
    ref_skus: list[str] = []           # Existing SKUs with this prefix (if any)


class SkuSuggestResponse(BaseModel):
    slot_labels: list[str]             # 7 slot names, empty string = unused
    suggested_values: list[str]        # 7 suggested values based on product name
    reasoning: str                     # Brief explanation


_KNOWN_CATEGORIES = """
Verken categories (prefix → slot labels):
JAC=Jacuzzi: [Colección, Producto, Tipo, Modelo, Capacidad, Color, Extra]
ROP=Ropa de baño: [Colección, Producto, Talla, Peso(kg), Color, -, -]
EST=Estufa: [Colección, Energía, BTU/Cap, Tipo, Modelo, Color, Extra]
TOA=Toallero eléctrico: [Colección, Alto(cm), Ancho(cm), Watts, Tipo, Modelo, Color]
AIR=Aire acondicionado: [Colección, Tipo, BTU, Inverter, Wifi, Modelo, Color]
FUN=Funda: [Colección, Ambiente, Tamaño, Modelo, Color, Extra, -]
BRA=Brasero: [Colección, Tipo, Modelo, Forma, Tamaño, Color, -]
CHI=Chimenea: [Colección, Energía, Tipo, Potencia, Modelo, Color, -]
RAD=Radiador: [Colección, Energía, Potencia, Material, Modelo, Color, -]
BOM=Bomba: [Colección, Producto, Tipo, Tamaño, Modelo, Color, Extra]
CAL=Calefactor: [Colección, Energía, Tipo, Modelo, Color, -, -]
INF=Inflable: [Colección, Energía, Potencia, Modelo, Color, -, -]
DES=Deshumidificador: [Colección, Modelo, Tipo, Capacidad, Wifi, Color, -]
PAR=Partes: [Colección, Parte1, Parte2, Parte3, Parte4, Parte5, -]
COJ=Cojín: [Colección, Tipo, Tamaño, Color, -, -, -]

Kaut categories:
SUP=SUP paddle: [Colección, Largo(cm), Tipo, Modelo, Color, -, -]
KAY=Kayak: [Colección, Tipo, Largo(cm), Capacidad, Modelo, Color, -]
BOT=Bote: [Colección, Tipo, Largo(cm), Personas, Piso, MotorHP, Modelo]
ISL=Isla inflable: [Colección, Forma, Largo, Ancho, Tipo, Modelo, Color]
MOT=Motor: [Colección, Tipo, Empuje/HP, Eje, Bat/Tiempos, Modelo, Marca]
ACC=Accesorios: [Colección, Categoría, Tipo, Caract1, Caract2, Caract3, -]
CHA=Chaleco: [Colección, Tipo, Material1, Material2, Tamaño, Color, -]
TRA=Traje: [Colección, Género, MM, Largo/Corto, Tamaño, -, -]
CAR=Carpa/Carro: [Colección, Tipo, Material, Largo, Modelo, -, -]
CSU=Canguro SUP: [Colección, Largo(cm), Tipo, Modelo, Color, -, -]
"""


@router.post("/suggest-sku", response_model=SkuSuggestResponse)
def suggest_sku(body: SkuSuggestRequest):
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    ref_block = ""
    if body.ref_skus:
        ref_block = f"\nExisting SKUs with prefix {body.prefix}: {', '.join(body.ref_skus[:8])}"

    prompt = f"""You are a SKU naming expert for a Chilean e-commerce company.

The company uses structured SKUs: PREFIX + up to 7 concatenated uppercase abbreviation segments.
Each category has a fixed set of slot labels (what each segment represents).
Segments are short uppercase abbreviations, no spaces, no separators.

Known category patterns:{_KNOWN_CATEGORIES}
{ref_block}

A user is creating a NEW category with prefix "{body.prefix}" for brand "{body.brand}".
Product name: "{body.product_name}"

Your task:
1. Propose 7 slot labels for this new category (use "" for unused slots).
   Base your labels on similar existing categories and what makes sense for this product type.
2. Suggest a short uppercase abbreviation value for each active slot, inferred from the product name.
3. Write a brief 1-sentence reasoning (in Spanish) explaining your slot choices.

Rules for slot labels:
- Use short Spanish nouns (Colección, Tipo, Modelo, Color, Capacidad, etc.)
- Most categories start with "Colección"
- Unused trailing slots = ""
- Max 5 active slots is typical; 7 only when necessary

Rules for suggested values:
- Uppercase, no spaces, no accents, max ~5 chars per slot
- Empty string for unused slots

Respond ONLY with a JSON object (no markdown, no extra text):
{{
  "slot_labels": ["label1", "label2", "label3", "label4", "label5", "label6", "label7"],
  "suggested_values": ["VAL1", "VAL2", "VAL3", "VAL4", "VAL5", "", ""],
  "reasoning": "Breve explicación en español..."
}}"""

    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"Claude SKU suggest JSON parse error: {e}\nRaw: {raw}")
        raise HTTPException(status_code=502, detail="No se pudo parsear la respuesta de IA")
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=502, detail=f"Error de IA: {e}")

    # Normalize to exactly 7 slots
    slot_labels = (data.get("slot_labels") or [])[:7]
    suggested_values = (data.get("suggested_values") or [])[:7]
    while len(slot_labels) < 7:
        slot_labels.append("")
    while len(suggested_values) < 7:
        suggested_values.append("")

    return SkuSuggestResponse(
        slot_labels=slot_labels,
        suggested_values=suggested_values,
        reasoning=data.get("reasoning", ""),
    )
