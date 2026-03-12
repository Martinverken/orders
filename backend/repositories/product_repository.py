from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from database import get_supabase
from models.product import Product, ProductCreate, ProductsPage


class ProductRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "products"

    def list(self, page: int = 1, per_page: int = 50) -> ProductsPage:
        start = (page - 1) * per_page
        result = (
            self.db.table(self.table)
            .select("*", count="exact")
            .order("name")
            .range(start, start + per_page - 1)
            .execute()
        )
        total = result.count or 0
        return ProductsPage(
            data=[Product(**r) for r in (result.data or [])],
            total=total,
            page=page,
            per_page=per_page,
            pages=max(1, math.ceil(total / per_page)) if total else 1,
        )

    def get(self, product_id: str) -> Optional[Product]:
        result = (
            self.db.table(self.table)
            .select("*")
            .eq("id", product_id)
            .maybe_single()
            .execute()
        )
        return Product(**result.data) if result.data else None

    def create(self, data: ProductCreate) -> Product:
        result = self.db.table(self.table).insert(data.model_dump()).execute()
        return Product(**result.data[0])

    def update(self, product_id: str, data: dict) -> Product:
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = (
            self.db.table(self.table)
            .update(data)
            .eq("id", product_id)
            .execute()
        )
        return Product(**result.data[0])

    def delete(self, product_id: str) -> None:
        self.db.table(self.table).delete().eq("id", product_id).execute()

    def list_all(self) -> list[Product]:
        result = self.db.table(self.table).select("*").order("name").execute()
        return [Product(**r) for r in (result.data or [])]

    def bulk_upsert(self, records: list[dict]) -> tuple[int, int]:
        """Upsert products by SKU from an imported CSV.
        For existing SKUs: updates all provided fields.
        For new SKUs: inserts the full record.
        Returns (inserted, updated).
        """
        if not records:
            return 0, 0

        now = datetime.now(timezone.utc).isoformat()
        skus = [r["sku"] for r in records]

        existing_result = (
            self.db.table(self.table)
            .select("sku")
            .in_("sku", skus)
            .execute()
        )
        existing_skus = {r["sku"] for r in (existing_result.data or [])}

        to_insert = []
        to_update = []
        for r in records:
            if r["sku"] in existing_skus:
                to_update.append(r)
            else:
                to_insert.append({**r, "updated_at": now})

        if to_insert:
            self.db.table(self.table).insert(to_insert).execute()

        for r in to_update:
            self.db.table(self.table).update({
                "name": r["name"],
                "brand": r.get("brand"),
                "category": r.get("category"),
                "height_cm": r.get("height_cm"),
                "width_cm": r.get("width_cm"),
                "length_cm": r.get("length_cm"),
                "weight_kg": r.get("weight_kg"),
                "updated_at": now,
            }).eq("sku", r["sku"]).execute()

        return len(to_insert), len(to_update)

    def sync_from_shopify(self, records: list[dict]) -> tuple[int, int]:
        """Upsert products from Shopify.
        For new products: inserts with name/sku/brand (dimensions left null).
        For existing products: updates only name and brand, preserves dimensions.
        Returns (inserted, updated).
        """
        if not records:
            return 0, 0

        now = datetime.now(timezone.utc).isoformat()
        skus = [r["sku"] for r in records]

        # Find which SKUs already exist
        existing_result = (
            self.db.table(self.table)
            .select("sku")
            .in_("sku", skus)
            .execute()
        )
        existing_skus = {r["sku"] for r in (existing_result.data or [])}

        to_insert = []
        to_update = []
        for r in records:
            if r["sku"] in existing_skus:
                to_update.append(r)
            else:
                to_insert.append({
                    "name": r["name"],
                    "sku": r["sku"],
                    "brand": r.get("brand"),
                    "image_url": r.get("image_url"),
                    "is_pack": r.get("is_pack", False),
                    "updated_at": now,
                })

        if to_insert:
            self.db.table(self.table).insert(to_insert).execute()

        for r in to_update:
            update_data: dict = {
                "name": r["name"],
                "brand": r.get("brand"),
                "image_url": r.get("image_url"),
                "updated_at": now,
            }
            if "is_pack" in r:
                update_data["is_pack"] = r["is_pack"]
            self.db.table(self.table).update(update_data).eq("sku", r["sku"]).execute()

        return len(to_insert), len(to_update)
