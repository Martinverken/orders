from datetime import datetime, timezone
from typing import Optional

from database import get_supabase
from models.courier import Courier, CourierCreate


class CourierRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "couriers"

    def list(self) -> list[Courier]:
        result = self.db.table(self.table).select("*").order("name").execute()
        return [Courier(**r) for r in (result.data or [])]

    def get(self, courier_id: str) -> Optional[Courier]:
        result = (
            self.db.table(self.table)
            .select("*")
            .eq("id", courier_id)
            .maybe_single()
            .execute()
        )
        return Courier(**result.data) if result.data else None

    def create(self, data: CourierCreate) -> Courier:
        result = self.db.table(self.table).insert(data.model_dump()).execute()
        return Courier(**result.data[0])

    def update(self, courier_id: str, data: dict) -> Courier:
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = (
            self.db.table(self.table)
            .update(data)
            .eq("id", courier_id)
            .execute()
        )
        return Courier(**result.data[0])

    def delete(self, courier_id: str) -> None:
        self.db.table(self.table).delete().eq("id", courier_id).execute()
