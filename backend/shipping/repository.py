"""SKU master CRUD operations."""
from database import get_supabase
from shipping.models import SKU, SKUCreate, classify_size

_TABLE = "sku_master"


def _to_sku(row: dict) -> SKU:
    """Build SKU with computed size_category."""
    row["size_category"] = classify_size(row.get("sum_sides_cm", 0), row.get("weight_kg", 0))
    return SKU(**row)


def list_skus() -> list[SKU]:
    """Get all SKUs ordered by product name."""
    result = get_supabase().table(_TABLE).select("*").order("product_name").execute()
    return [_to_sku(row) for row in result.data]


def get_sku_by_code(sku: str) -> SKU | None:
    """Get a single SKU by its code."""
    result = get_supabase().table(_TABLE).select("*").eq("sku", sku).execute()
    if result.data:
        return _to_sku(result.data[0])
    return None


def get_sku_by_id(sku_id: str) -> SKU | None:
    """Get a single SKU by its ID."""
    result = get_supabase().table(_TABLE).select("*").eq("id", sku_id).execute()
    if result.data:
        return _to_sku(result.data[0])
    return None


def upsert_sku(data: SKUCreate) -> SKU:
    """Create or update a SKU (upsert by sku code)."""
    payload = data.model_dump()
    payload["updated_at"] = "now()"
    result = (
        get_supabase()
        .table(_TABLE)
        .upsert(payload, on_conflict="sku")
        .execute()
    )
    return _to_sku(result.data[0])


def delete_sku(sku_id: str) -> bool:
    """Delete a SKU by ID."""
    result = get_supabase().table(_TABLE).delete().eq("id", sku_id).execute()
    return len(result.data) > 0


def search_skus(query: str) -> list[SKU]:
    """Search SKUs by name or code."""
    result = (
        get_supabase()
        .table(_TABLE)
        .select("*")
        .or_(f"sku.ilike.%{query}%,product_name.ilike.%{query}%")
        .order("product_name")
        .execute()
    )
    return [_to_sku(row) for row in result.data]
