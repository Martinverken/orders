import csv
import io
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import get_settings
from repositories.product_repository import ProductRepository
from models.product import ProductCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/products", tags=["products"])
repo = ProductRepository()

_API_VERSION = "2024-01"


class ProductRequest(BaseModel):
    name: str
    sku: str
    brand: Optional[str] = None
    category: Optional[str] = None
    height_cm: Optional[float] = None
    width_cm: Optional[float] = None
    length_cm: Optional[float] = None
    weight_kg: Optional[float] = None


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    height_cm: Optional[float] = None
    width_cm: Optional[float] = None
    length_cm: Optional[float] = None
    weight_kg: Optional[float] = None


@router.get("/export")
def export_products():
    """Export all products as a CSV file."""
    all_products = repo.list_all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["sku", "name", "brand", "category", "height_cm", "width_cm", "length_cm", "weight_kg"])
    for p in all_products:
        writer.writerow([
            p.sku,
            p.name,
            p.brand or "",
            p.category or "",
            p.height_cm if p.height_cm is not None else "",
            p.width_cm if p.width_cm is not None else "",
            p.length_cm if p.length_cm is not None else "",
            p.weight_kg if p.weight_kg is not None else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=productos.csv"},
    )


@router.post("/import")
async def import_products(file: UploadFile = File(...)):
    """Import products from a CSV file. Upserts by SKU."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    records = []
    for row in reader:
        sku = (row.get("sku") or "").strip()
        name = (row.get("name") or "").strip()
        if not sku or not name:
            continue
        records.append({
            "sku": sku,
            "name": name,
            "brand": row.get("brand", "").strip() or None,
            "category": row.get("category", "").strip() or None,
            "height_cm": _parse_float(row.get("height_cm", "")),
            "width_cm": _parse_float(row.get("width_cm", "")),
            "length_cm": _parse_float(row.get("length_cm", "")),
            "weight_kg": _parse_float(row.get("weight_kg", "")),
        })

    if not records:
        raise HTTPException(status_code=400, detail="No se encontraron filas válidas en el CSV")

    inserted, updated = repo.bulk_upsert(records)
    return {"success": True, "inserted": inserted, "updated": updated}


def _parse_float(v: str) -> Optional[float]:
    try:
        return float(v.strip()) if v.strip() else None
    except ValueError:
        return None


@router.get("")
def list_products(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    result = repo.list(page=page, per_page=per_page)
    return result.model_dump()


@router.post("")
def create_product(body: ProductRequest):
    data = ProductCreate(**body.model_dump())
    product = repo.create(data)
    return {"success": True, "data": product.model_dump()}


@router.patch("/{product_id}")
def update_product(product_id: str, body: ProductUpdateRequest):
    existing = repo.get(product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    product = repo.update(product_id, updates)
    return {"success": True, "data": product.model_dump()}


@router.delete("/{product_id}")
def delete_product(product_id: str):
    existing = repo.get(product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    repo.delete(product_id)
    return {"success": True}


@router.post("/sync-shopify")
def sync_shopify_products():
    """Fetch all active products from both Shopify stores and upsert into the products table.
    Preserves existing dimensions and weight (only updates name and brand for existing SKUs).
    """
    settings = get_settings()
    stores = []
    if settings.shopify_verken_url and settings.shopify_verken_token:
        stores.append(("Verken", settings.shopify_verken_url, settings.shopify_verken_token))
    if settings.shopify_kaut_url and settings.shopify_kaut_token:
        stores.append(("Kaut", settings.shopify_kaut_url, settings.shopify_kaut_token))

    if not stores:
        raise HTTPException(status_code=503, detail="No hay tiendas Shopify configuradas")

    all_records: list[dict] = []
    store_stats: list[dict] = []

    for brand, store_url, token in stores:
        try:
            products = _fetch_shopify_products(store_url, token)
            records = _products_to_records(products, brand)
            all_records.extend(records)
            store_stats.append({"store": brand, "products_fetched": len(products), "variants": len(records)})
            logger.info(f"[sync-shopify] {brand}: {len(products)} products → {len(records)} variants")
        except Exception as e:
            logger.error(f"[sync-shopify] Error fetching {brand}: {e}")
            raise HTTPException(status_code=502, detail=f"Error al obtener productos de {brand}: {e}")

    inserted, updated = repo.sync_from_shopify(all_records)
    return {
        "success": True,
        "inserted": inserted,
        "updated": updated,
        "stores": store_stats,
    }


def _fetch_shopify_products(store_url: str, token: str) -> list[dict]:
    """Fetch all active products from a Shopify store."""
    base_url = f"https://{store_url}/admin/api/{_API_VERSION}"
    headers = {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    }
    url = f"{base_url}/products.json"
    params: dict | None = {
        "limit": 250,
        "status": "active",
        "fields": "id,title,variants",
    }

    all_products: list[dict] = []
    with httpx.Client(timeout=30) as client:
        while url:
            resp = client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            all_products.extend(data.get("products") or [])

            # Cursor-based pagination via Link header
            url = _parse_next_link(resp.headers.get("Link", ""))
            params = None  # Already encoded in next URL

    return all_products


def _products_to_records(products: list[dict], brand: str) -> list[dict]:
    """Convert Shopify products to flat records (one per variant with a SKU)."""
    seen_skus: set[str] = set()
    records = []
    for p in products:
        title = p.get("title", "").strip()
        variants = p.get("variants") or []
        for v in variants:
            sku = (v.get("sku") or "").strip()
            if not sku or sku in seen_skus:
                continue
            seen_skus.add(sku)

            variant_title = (v.get("title") or "").strip()
            if variant_title and variant_title.lower() != "default title":
                name = f"{title} — {variant_title}"
            else:
                name = title

            records.append({"name": name, "sku": sku, "brand": brand})

    return records


def _parse_next_link(link_header: str) -> str | None:
    if not link_header:
        return None
    for part in link_header.split(","):
        part = part.strip()
        if 'rel="next"' in part:
            start = part.find("<")
            end = part.find(">")
            if start != -1 and end != -1:
                return part[start + 1:end]
    return None
