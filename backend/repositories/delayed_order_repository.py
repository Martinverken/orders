from database import get_supabase
from models.order import Order, DelayedOrder, DelayMetric


class DelayedOrderRepository:
    def __init__(self):
        self.db = get_supabase()
        self.table = "delayed_orders"

    def archive_batch(self, orders: list[Order]) -> int:
        """Archive resolved late orders into delayed_orders table."""
        if not orders:
            return 0
        records = [
            {
                "external_id": o.external_id,
                "source": o.source,
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

    def get_monthly_metrics(self) -> list[DelayMetric]:
        """Return delay counts and avg days delayed grouped by month and source."""
        result = self.db.table(self.table).select("source,limit_delivery_date,days_delayed").execute()
        rows = result.data or []

        # Aggregate in Python (avoids raw SQL complexity with Supabase client)
        from collections import defaultdict
        buckets: dict[tuple, list[float]] = defaultdict(list)
        for r in rows:
            raw_date = r.get("limit_delivery_date", "")
            source = r.get("source", "")
            days = r.get("days_delayed")
            if not raw_date or not source or days is None:
                continue
            month = str(raw_date)[:7]  # "2026-01"
            buckets[(month, source)].append(float(days))

        metrics = [
            DelayMetric(
                month=month,
                source=source,
                count=len(days_list),
                avg_days_delayed=round(sum(days_list) / len(days_list), 1),
            )
            for (month, source), days_list in sorted(buckets.items())
        ]
        return metrics
