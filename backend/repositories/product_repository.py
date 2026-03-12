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
