from database import get_supabase
from models.order import Order, OrderCreate, OrdersPage, OrderUrgency, compute_urgency, _today_santiago
from datetime import timedelta, date
from typing import Optional


_PENDING_LIKE = ["pending", "ready_to_ship"]


def _today_iso() -> str:
    return _today_santiago().isoformat()


def _tomorrow_iso() -> str:
    return (_today_santiago() + timedelta(days=1)).isoformat()


def _day_after_tomorrow_iso() -> str:
    return (_today_santiago() + timedelta(days=2)).isoformat()


class OrderRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "orders"

    def upsert_batch(self, orders: list[OrderCreate]) -> int:
        if not orders:
            return 0
        records = [
            {
                "external_id": o.external_id,
                "source": o.source,
                "status": o.status,
                "created_at_source": o.created_at_source.isoformat() if o.created_at_source else None,
                "address_updated_at": o.address_updated_at.isoformat() if o.address_updated_at else None,
                "limit_delivery_date": o.limit_delivery_date.isoformat(),
                "urgency": compute_urgency(o.limit_delivery_date, o.status).value,
                "product_name": o.product_name,
                "product_quantity": o.product_quantity,
                "raw_data": o.raw_data,
            }
            for o in orders
        ]
        result = (
            self.db.table(self.table)
            .upsert(records, on_conflict="external_id,source")
            .execute()
        )
        return len(result.data) if result.data else 0

    def get_overdue(self) -> list[Order]:
        """Pending/ready_to_ship orders with delivery date before today."""
        result = (
            self.db.table(self.table)
            .select("*")
            .in_("status", _PENDING_LIKE)
            .lt("limit_delivery_date", _today_iso())
            .order("limit_delivery_date")
            .execute()
        )
        return [Order(**r) for r in (result.data or [])]

    def get_due_today(self) -> list[Order]:
        """Pending/ready_to_ship orders due today."""
        result = (
            self.db.table(self.table)
            .select("*")
            .in_("status", _PENDING_LIKE)
            .gte("limit_delivery_date", _today_iso())
            .lt("limit_delivery_date", _tomorrow_iso())
            .order("limit_delivery_date")
            .execute()
        )
        return [Order(**r) for r in (result.data or [])]

    def get_delivered_today(self) -> list[Order]:
        """Shipped orders with delivery date today."""
        result = (
            self.db.table(self.table)
            .select("*")
            .eq("status", "shipped")
            .gte("limit_delivery_date", _today_iso())
            .lt("limit_delivery_date", _tomorrow_iso())
            .order("limit_delivery_date")
            .execute()
        )
        return [Order(**r) for r in (result.data or [])]

    def get_tomorrow(self) -> list[Order]:
        """Pending/ready_to_ship orders due tomorrow."""
        result = (
            self.db.table(self.table)
            .select("*")
            .in_("status", _PENDING_LIKE)
            .gte("limit_delivery_date", _tomorrow_iso())
            .lt("limit_delivery_date", _day_after_tomorrow_iso())
            .order("limit_delivery_date")
            .execute()
        )
        return [Order(**r) for r in (result.data or [])]

    def get_paginated(
        self,
        source: Optional[str] = None,
        status: Optional[str] = None,
        urgency: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> OrdersPage:
        query = self.db.table(self.table).select("*", count="exact")
        if source:
            query = query.eq("source", source)
        if status:
            query = query.eq("status", status)
        # Translate urgency filter to date + status constraints
        if urgency == OrderUrgency.OVERDUE:
            query = query.in_("status", _PENDING_LIKE).lt("limit_delivery_date", _today_iso())
        elif urgency == OrderUrgency.DUE_TODAY:
            query = query.in_("status", _PENDING_LIKE).gte("limit_delivery_date", _today_iso()).lt("limit_delivery_date", _tomorrow_iso())
        elif urgency == OrderUrgency.DELIVERED_TODAY:
            query = query.eq("status", "shipped").gte("limit_delivery_date", _today_iso()).lt("limit_delivery_date", _tomorrow_iso())
        elif urgency == OrderUrgency.TOMORROW:
            query = query.in_("status", _PENDING_LIKE).gte("limit_delivery_date", _tomorrow_iso()).lt("limit_delivery_date", _day_after_tomorrow_iso())
        elif urgency == OrderUrgency.ON_TIME:
            query = query.gte("limit_delivery_date", _day_after_tomorrow_iso())
        elif urgency == "active":
            # overdue + due_today + tomorrow: all pending/ready_to_ship orders due by tomorrow
            query = query.in_("status", _PENDING_LIKE).lt("limit_delivery_date", _day_after_tomorrow_iso())

        offset = (page - 1) * per_page
        result = query.order("limit_delivery_date").range(offset, offset + per_page - 1).execute()
        total = result.count or 0
        orders = [Order(**r) for r in (result.data or [])]
        pages = (total + per_page - 1) // per_page if total else 0
        return OrdersPage(data=orders, total=total, page=page, per_page=per_page, pages=pages)

    def get_summary_counts(self) -> dict:
        """Count orders by stored urgency column."""
        result = self.db.table(self.table).select("urgency").execute()
        rows = result.data or []
        overdue = due_today = delivered_today = tomorrow_count = on_time = 0
        for r in rows:
            u = r.get("urgency") or ""
            if u == "overdue":
                overdue += 1
            elif u == "due_today":
                due_today += 1
            elif u == "delivered_today":
                delivered_today += 1
            elif u == "tomorrow":
                tomorrow_count += 1
            elif u == "on_time":
                on_time += 1
        return {
            "total": len(rows),
            "overdue": overdue,
            "due_today": due_today,
            "delivered_today": delivered_today,
            "tomorrow": tomorrow_count,
            "on_time": on_time,
        }

    def get_by_external_id(self, external_id: str, source: str) -> Optional[Order]:
        result = (
            self.db.table(self.table)
            .select("*")
            .eq("external_id", external_id)
            .eq("source", source)
            .single()
            .execute()
        )
        return Order(**result.data) if result.data else None

    def get_all_external_ids(self, source: str) -> set[str]:
        """Return all external_ids currently in DB for a given source."""
        result = (
            self.db.table(self.table)
            .select("external_id")
            .eq("source", source)
            .execute()
        )
        return {r["external_id"] for r in (result.data or [])}

    def get_all_by_source(self, source: str) -> dict[str, "Order"]:
        """Return all orders for a source as {external_id: Order} in a single query."""
        result = self.db.table(self.table).select("*").eq("source", source).execute()
        return {r["external_id"]: Order(**r) for r in (result.data or [])}

    def delete_batch(self, ids: list[str]) -> None:
        """Delete orders by their UUID ids."""
        if not ids:
            return
        self.db.table(self.table).delete().in_("id", ids).execute()
