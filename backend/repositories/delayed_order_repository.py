import math
from collections import defaultdict
from datetime import datetime
from database import get_supabase
from models.order import Order, DelayedOrder, DelayMetric, HistoricalOrder, OnTimeMetric
from repositories.order_repository import _extract_city_commune
from integrations.welivery.client import get_comprobante


def _extract_logistics_operator(order: Order) -> str | None:
    """Extract logistics operator from raw_data depending on source."""
    if not order.raw_data:
        return None
    if order.source == "falabella":
        return order.raw_data.get("ShippingProvider") or order.raw_data.get("ShippingProviderType")
    if order.source == "mercadolibre":
        return order.raw_data.get("delivery_mode")
    return None


def _should_fetch_comprobante(order: Order) -> bool:
    """ML Flex and Falabella Direct orders are handled by Welivery."""
    if not order.raw_data:
        return False
    if order.source == "mercadolibre":
        return order.raw_data.get("delivery_mode") == "Flex"
    if order.source == "falabella":
        return (order.raw_data.get("ShippingProviderType") or "").lower() != "regular"
    return False


def _get_welivery_id(order: Order) -> str | None:
    """Construct the Welivery reference ID based on source."""
    if not order.raw_data:
        return None
    if order.source == "mercadolibre":
        pack_id = order.raw_data.get("pack_id")
        return str(pack_id) if pack_id else order.external_id
    if order.source == "falabella":
        order_number = order.raw_data.get("OrderNumber")
        tracking = order.raw_data.get("TrackingCode")
        items = order.raw_data.get("_items") or []
        package_id = items[0].get("PackageId") if items else None
        if order_number and package_id and tracking:
            return f"{order_number}-{package_id}-{tracking}"
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
        # Fetch existing delivered_at values to preserve first-set date (immutable once written)
        existing_resp = (
            self.db.table(self.table)
            .select("external_id,source,delivered_at")
            .in_("external_id", [o.external_id for o in orders])
            .execute()
        )
        existing_delivered_at = {
            (r["external_id"], r["source"]): r["delivered_at"]
            for r in (existing_resp.data or [])
            if r.get("delivered_at")
        }
        records = [
            {
                "external_id": o.external_id,
                "source": o.source,
                "limit_delivery_date": o.limit_delivery_date.isoformat(),
                "delivered_at": (
                    existing_delivered_at.get((o.external_id, o.source))
                    or (
                        delivery_dates[o.id].isoformat()
                        if delivery_dates and delivery_dates.get(o.id)
                        else None
                    )
                ),
                "logistics_operator": _extract_logistics_operator(o),
                "urgency": o.urgency.value if o.urgency else None,
                "status": o.status,
                "raw_data": o.raw_data,
                "comprobante": (
                    get_comprobante(welivery_id)
                    if _should_fetch_comprobante(o) and (welivery_id := _get_welivery_id(o))
                    else None
                ),
                **dict(zip(["city", "commune"], _extract_city_commune(o.source, o.raw_data or {}))),
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
        city: str | None = None,
        commune: str | None = None,
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
        if city:
            query = query.eq("city", city)
        if commune:
            query = query.eq("commune", commune)
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

    def get_distinct_cities(self) -> list[str]:
        result = self.db.table(self.table).select("city").execute()
        cities = sorted({r["city"] for r in (result.data or []) if r.get("city")})
        if "Santiago" in cities:
            cities.remove("Santiago")
            cities.insert(0, "Santiago")
        return cities

    def get_distinct_communes(self, city: str | None = None) -> list[str]:
        query = self.db.table(self.table).select("commune")
        if city:
            query = query.eq("city", city)
        result = query.execute()
        return sorted({r["commune"] for r in (result.data or []) if r.get("commune")})

    def get_shipped_historical(self, source: str) -> list[dict]:
        """Return archived orders with status='shipped' and no delivered_at yet."""
        result = (
            self.db.table(self.table)
            .select("id,raw_data")
            .eq("source", source)
            .eq("status", "shipped")
            .is_("delivered_at", "null")
            .execute()
        )
        return result.data or []

    def mark_delivered(self, record_id: str, delivered_at: datetime) -> None:
        """Update a historical order's status and delivered_at once delivery is confirmed."""
        self.db.table(self.table).update({
            "status": "delivered",
            "delivered_at": delivered_at.isoformat(),
        }).eq("id", record_id).execute()

    def refresh_missing_comprobantes(self) -> int:
        """Fetch and save comprobantes for Flex/Direct orders (ML and Falabella) missing one."""
        result = (
            self.db.table(self.table)
            .select("id,external_id,source,raw_data,logistics_operator")
            .is_("comprobante", "null")
            .execute()
        )
        rows = result.data or []
        updated = 0
        for row in rows:
            raw_data = row.get("raw_data") or {}
            source = row.get("source", "")
            # Build a minimal Order-like object for the helpers
            from types import SimpleNamespace
            o = SimpleNamespace(
                external_id=row["external_id"],
                source=source,
                raw_data=raw_data,
            )
            if not _should_fetch_comprobante(o):
                continue
            welivery_id = _get_welivery_id(o)
            if not welivery_id:
                continue
            comprobante = get_comprobante(welivery_id)
            if comprobante:
                self.db.table(self.table).update({"comprobante": comprobante}).eq("id", row["id"]).execute()
                updated += 1
        return updated

    def update_case_info(self, record_id: str, case_number: str | None, comments: str | None) -> None:
        """Update case number and comments for a historical order."""
        self.db.table(self.table).update({
            "case_number": case_number,
            "comments": comments,
        }).eq("id", record_id).execute()

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
