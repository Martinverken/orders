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

        offset = (page - 1) * per_page
        result = query.order("limit_delivery_date").range(offset, offset + per_page - 1).execute()
        total = result.count or 0
        orders = [Order(**r) for r in (result.data or [])]
        pages = (total + per_page - 1) // per_page if total else 0
        return OrdersPage(data=orders, total=total, page=page, per_page=per_page, pages=pages)

    def get_summary_counts(self) -> dict:
        """Fetch delivery dates + statuses and compute urgency counts in Python."""
        result = self.db.table(self.table).select("limit_delivery_date,status").execute()
        rows = result.data or []
        today = _today_santiago()
        tomorrow = today + timedelta(days=1)
        pending_like = {"pending", "ready_to_ship"}
        overdue = due_today = delivered_today = tomorrow_count = on_time = 0
        for r in rows:
            raw = r.get("limit_delivery_date", "")
            status = r.get("status", "")
            if not raw:
                continue
            try:
                d = date.fromisoformat(str(raw)[:10])
                if d < today and status in pending_like:
                    overdue += 1
                elif d == today and status in pending_like:
                    due_today += 1
                elif d == today and status == "shipped":
                    delivered_today += 1
                elif d == tomorrow and status in pending_like:
                    tomorrow_count += 1
                else:
                    on_time += 1
            except ValueError:
                pass
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
