"""API endpoints for SKU master and shipping cost calculator."""
from fastapi import APIRouter, HTTPException
from shipping.models import SKUCreate, SKU, ShippingQuoteResponse, classify_size
from shipping import repository
from shipping.couriers import quote_all

router = APIRouter(prefix="/api/shipping", tags=["shipping"])


# ── SKU CRUD ─────────────────────────────────────────────────────────────────

@router.get("/skus", response_model=list[SKU])
def list_skus(q: str | None = None):
    """List all SKUs, optionally filtered by search query."""
    if q:
        return repository.search_skus(q)
    return repository.list_skus()


@router.get("/skus/{sku_id}", response_model=SKU)
def get_sku(sku_id: str):
    """Get a single SKU by ID."""
    sku = repository.get_sku_by_id(sku_id)
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")
    return sku


@router.post("/skus", response_model=SKU)
def create_or_update_sku(data: SKUCreate):
    """Create or update a SKU (upsert by sku code)."""
    return repository.upsert_sku(data)


@router.delete("/skus/{sku_id}")
def delete_sku(sku_id: str):
    """Delete a SKU."""
    if not repository.delete_sku(sku_id):
        raise HTTPException(status_code=404, detail="SKU not found")
    return {"ok": True}


# ── Cotización ───────────────────────────────────────────────────────────────

@router.get("/quote/{sku_code}", response_model=ShippingQuoteResponse)
def get_shipping_quote(
    sku_code: str,
    commune: str,
    product_price: float = 0,
    rating: str = "5/5",
):
    """Get shipping cost quotes from all couriers for a SKU + commune.

    product_price: precio del producto en CLP (afecta tarifa Falabella).
    rating: calificación del vendedor en Falabella (5/5, 4/5, 3/5, 2/5).
    Example: GET /api/shipping/quote/POL-001?commune=Providencia&product_price=25000&rating=5/5
    """
    sku = repository.get_sku_by_code(sku_code)
    if not sku:
        raise HTTPException(status_code=404, detail=f"SKU '{sku_code}' not found")

    quotes = quote_all(
        sku.weight_kg, sku.sum_sides_cm, commune,
        height_cm=sku.height_cm, width_cm=sku.width_cm, length_cm=sku.length_cm,
        product_price=product_price, rating=rating,
    )

    return ShippingQuoteResponse(
        sku=sku.sku,
        product_name=sku.product_name,
        weight_kg=sku.weight_kg,
        sum_sides_cm=sku.sum_sides_cm,
        size_category=sku.size_category,
        commune=commune,
        quotes=quotes,
    )


@router.post("/quote/calculate")
def calculate_quote(
    weight_kg: float,
    height_cm: float,
    width_cm: float,
    length_cm: float,
    commune: str,
    product_price: float = 0,
    rating: str = "5/5",
):
    """Calculate shipping quotes without a saved SKU (ad-hoc).

    product_price: precio del producto en CLP (afecta tarifa Falabella para <$19.990 vs >=19.990).
    rating: calificación del vendedor en Falabella (5/5, 4/5, 3/5, 2/5).
    Example: POST /api/shipping/quote/calculate?weight_kg=5&height_cm=30&width_cm=40&length_cm=50&commune=Santiago
    """
    sum_sides = height_cm + width_cm + length_cm
    quotes = quote_all(
        weight_kg, sum_sides, commune,
        height_cm=height_cm, width_cm=width_cm, length_cm=length_cm,
        product_price=product_price, rating=rating,
    )
    return {
        "weight_kg": weight_kg,
        "sum_sides_cm": sum_sides,
        "size_category": classify_size(sum_sides, weight_kg),
        "commune": commune,
        "quotes": quotes,
    }
