import math
from collections import defaultdict
from datetime import datetime
from database import get_supabase
from models.order import Order, DelayedOrder, DelayMetric, HistoricalOrder, OnTimeMetric


def _extract_logistics_operator(order: Order) -> str | None:
    """Extract logistics operator from raw_data depending on source."""
    if not order.raw_data:
        return None
    if order.source == "falabella":
        return order.raw_data.get("ShippingProvider") or order.raw_data.get("ShippingProviderType")
    if order.source == "mercadolibre":
        return order.raw_data.get("delivery_mode")
    return None


class DelayedOrderRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "delayed_orders"

    def archive_batch(
        self,
        orders: list[Order],
        was_delayed: bool = True,
        delivery_dates: dict[str, datetime | None] | None = None,
    ) -> int:
        """Archive resolved orders into delayed_orders table.

        was_delayed=True  → order was delivered after limit_delivery_date
        was_delayed=False → order was resolved before limit_delivery_date (on time)
        delivery_dates    → map of order.id → actual delivery/dispatch datetime
        """
        if not orders:
            return 0
        records = [
            {
                "external_id": o.external_id,
                "source": o.source,
                "limit_delivery_date": o.limit_delivery_date.isoformat(),
                "delivered_at": (
                    delivery_dates[o.id].isoformat()
                    if delivery_dates and delivery_dates.get(o.id)
                    else None
                ),
                "logistics_operator": _extract_logistics_operator(o),
                "urgency": o.urgency.value if o.urgency else None,
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

    def get_paginated(
        self,
        source: str | None = None,
        was_delayed: bool | None = None,
        logistics_operator: str | None = None,
        page: int = 1,
        per_page: int = 25,
    ) -> dict:
        query = self.db.table(self.table).select("*", count="exact")
        if source:
            query = query.eq("source", source)
        if was_delayed is True:
            query = query.gt("days_delayed", 0)
        elif was_delayed is False:
            query = query.lte("days_delayed", 0)
        if logistics_operator:
            parts = [v.strip() for v in logistics_operator.split(",") if v.strip()]
            if len(parts) > 1:
                query = query.in_("logistics_operator", parts)
            elif parts:
                query = query.eq("logistics_operator", parts[0])
        offset = (page - 1) * per_page
        result = query.order("resolved_at", desc=True).range(offset, offset + per_page - 1).execute()
        total = result.count or 0
        data = [HistoricalOrder(**r) for r in (result.data or [])]
        return {
            "data": data,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": math.ceil(total / per_page) if per_page > 0 else 0,
        }

    def get_monthly_metrics(self) -> list[DelayMetric]:
        """Return delay counts and avg days delayed grouped by month, source and logistics operator."""
        result = self.db.table(self.table).select(
            "source,limit_delivery_date,days_delayed,logistics_operator"
        ).execute()
        rows = result.data or []

        buckets: dict[tuple, list[float]] = defaultdict(list)
        for r in rows:
            raw_date = r.get("limit_delivery_date", "")
            source = r.get("source", "")
            days = r.get("days_delayed")
            operator = r.get("logistics_operator") or "Sin especificar"
            if not raw_date or not source or days is None:
                continue
            if float(days) <= 0:
                continue  # on-time orders excluded from delay metrics
            month = str(raw_date)[:7]  # "2026-01"
            buckets[(month, source, operator)].append(float(days))

        metrics = [
            DelayMetric(
                month=month,
                source=source,
                logistics_operator=operator,
                count=len(days_list),
                avg_days_delayed=round(sum(days_list) / len(days_list), 1),
            )
            for (month, source, operator), days_list in sorted(buckets.items())
        ]
        return metrics

    def get_historical_metrics(self) -> dict:
        """Return both on-time and delayed metrics grouped by month/source/logistics_operator."""
        result = self.db.table(self.table).select(
            "source,limit_delivery_date,days_delayed,logistics_operator"
        ).execute()
        rows = result.data or []

        delayed_buckets: dict[tuple, list[float]] = defaultdict(list)
        on_time_buckets: dict[tuple, int] = defaultdict(int)

        for r in rows:
            raw_date = r.get("limit_delivery_date", "")
            source = r.get("source", "")
            days = r.get("days_delayed")
            operator = r.get("logistics_operator") or "Sin especificar"
            if not raw_date or not source or days is None:
                continue
            month = str(raw_date)[:7]
            if float(days) > 0:
                delayed_buckets[(month, source, operator)].append(float(days))
            else:
                on_time_buckets[(month, source, operator)] += 1

        delayed = [
            DelayMetric(
                month=month,
                source=source,
                logistics_operator=operator,
                count=len(days_list),
                avg_days_delayed=round(sum(days_list) / len(days_list), 1),
            )
            for (month, source, operator), days_list in sorted(delayed_buckets.items())
        ]

        on_time = [
            OnTimeMetric(
                month=month,
                source=source,
                logistics_operator=operator,
                count=count,
            )
            for (month, source, operator), count in sorted(on_time_buckets.items())
        ]

        return {"delayed": delayed, "on_time": on_time}
