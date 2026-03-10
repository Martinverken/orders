import math
from collections import defaultdict
from datetime import datetime
from database import get_supabase
from models.order import Order, DelayedOrder, DelayMetric, HistoricalOrder, OnTimeMetric, OrderCase
from repositories.order_repository import _extract_city_commune
from integrations.welivery.client import get_comprobante


def _extract_logistics_operator(order: Order) -> str | None:
    """Extract logistics operator from raw_data depending on source."""
    if not order.raw_data:
        return None
    if order.source.startswith("shopify"):
        return "Welivery"
    if order.source == "falabella":
        return order.raw_data.get("ShippingProvider") or order.raw_data.get("ShippingProviderType")
    if order.source == "mercadolibre":
        return order.raw_data.get("delivery_mode")
    return None


def _should_fetch_comprobante(order: Order) -> bool:
    """ML Flex, Falabella Direct, and all Shopify orders are handled by Welivery."""
    if not order.raw_data:
        return False
    if order.source.startswith("shopify"):
        return True
    if order.source == "mercadolibre":
        return order.raw_data.get("delivery_mode") == "Flex"
    if order.source == "falabella":
        return (order.raw_data.get("ShippingProviderType") or "").lower() != "regular"
    return False


def _get_welivery_id(order: Order) -> str | None:
    """Construct the Welivery reference ID based on source."""
    if not order.raw_data:
        return None
    if order.source.startswith("shopify"):
        name = str(order.raw_data.get("name", "")).lstrip("#")
        return name or None
    if order.source == "mercadolibre":
        tracking = order.raw_data.get("tracking_number")
        return str(tracking) if tracking else None
    if order.source == "falabella":
        tracking = order.raw_data.get("TrackingCode")
        return str(tracking) if tracking else None
    return None


def _get_tracking_link(order: Order) -> str | None:
    """Build a tracking link for orders that don't use Welivery comprobante.

    Used as fallback comprobante for Paris, Walmart, and Falabella Regular.
    """
    if not order.raw_data:
        return None
    if order.source == "paris":
        subs = order.raw_data.get("subOrders") or []
        if subs:
            delivery_id = subs[0].get("deliveryExternalId") if isinstance(subs[0], dict) else getattr(subs[0], "deliveryExternalId", None)
            if delivery_id:
                return f"https://app.enviame.io/deliveries/{delivery_id}"
    if order.source == "walmart":
        # Try trackingURL from orderLineStatuses first, then enviame generic
        order_lines = order.raw_data.get("orderLines", {})
        line_list = order_lines.get("orderLine", []) if isinstance(order_lines, dict) else []
        if line_list:
            statuses = line_list[0].get("orderLineStatuses", []) if isinstance(line_list[0], dict) else []
            if statuses:
                tracking_info = statuses[0].get("trackingInfo", {}) if isinstance(statuses[0], dict) else {}
                if isinstance(tracking_info, dict):
                    if tracking_info.get("trackingURL"):
                        return str(tracking_info["trackingURL"])
                    if tracking_info.get("trackingNumber"):
                        return f"https://tracking.enviame.io/{tracking_info['trackingNumber']}"
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
        handoff_dates: dict[str, datetime | None] | None = None,
        blame_map: dict[str, str | None] | None = None,
    ) -> int:
        """Archive resolved orders into delayed_orders table.

        was_delayed=True  → order was delivered after limit_delivery_date
        was_delayed=False → order was resolved before limit_delivery_date (on time)
        delivery_dates    → map of order.id → actual delivery/dispatch datetime
        handoff_dates     → map of order.id → actual handoff datetime (when warehouse handed to carrier)
        blame_map         → map of order.id → 'bodega' | 'transportista' | None
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
                "limit_handoff_date": (o.limit_handoff_date.isoformat() if o.limit_handoff_date else o.limit_delivery_date.isoformat()),
                "delivered_at": (
                    existing_delivered_at.get((o.external_id, o.source))
                    or (
                        delivery_dates[o.id].isoformat()
                        if delivery_dates and delivery_dates.get(o.id)
                        else None
                    )
                ),
                "handoff_at": (
                    handoff_dates[o.id].isoformat()
                    if handoff_dates and handoff_dates.get(o.id)
                    else None
                ),
                "blame": (blame_map.get(o.id) if blame_map else None),
                "logistics_operator": _extract_logistics_operator(o),
                "urgency": o.urgency.value if o.urgency else None,
                "status": o.status,
                "raw_data": o.raw_data,
                "comprobante": (
                    get_comprobante(welivery_id)
                    if _should_fetch_comprobante(o) and (welivery_id := _get_welivery_id(o))
                    else _get_tracking_link(o)
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
        # Transfer cases from active orders to their new delayed_orders records
        if result.data:
            ei_to_doi = {r["external_id"]: r["id"] for r in result.data}
            for o in orders:
                doid = ei_to_doi.get(o.external_id)
                if doid and o.id:
                    self.db.table("order_cases").update({
                        "delayed_order_id": doid,
                        "order_id": None,
                    }).eq("order_id", str(o.id)).execute()
        return len(result.data) if result.data else 0

    def get_archived_external_ids(self, source: str) -> set[str]:
        result = self.db.table(self.table).select("external_id").eq("source", source).execute()
        return {r["external_id"] for r in (result.data or [])}

    def get_paginated(
        self,
        source: str | None = None,
        was_delayed: bool | None = None,
        logistics_operator: str | None = None,
        city: str | None = None,
        commune: str | None = None,
        has_case: bool | None = None,
        order_number: str | None = None,
        month: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        page: int = 1,
        per_page: int = 25,
    ) -> dict:
        select_expr = "*, order_cases!inner(*)" if has_case else "*, order_cases(*)"
        query = self.db.table(self.table).select(select_expr, count="exact")
        if source:
            query = query.eq("source", source)
        if order_number:
            query = query.or_(f"external_id.ilike.%{order_number}%,raw_data->>OrderNumber.ilike.%{order_number}%")
        if month:
            # month is "YYYY-MM", compute next month start
            y, m = int(month[:4]), int(month[5:7])
            if m == 12:
                next_m = f"{y+1}-01-01"
            else:
                next_m = f"{y}-{m+1:02d}-01"
            query = query.gte("limit_delivery_date", f"{month}-01").lt("limit_delivery_date", next_m)
        if date_from:
            query = query.gte("limit_delivery_date", date_from)
        if date_to:
            query = query.lte("limit_delivery_date", date_to)
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
        data = [
            HistoricalOrder(
                **{k: v for k, v in r.items() if k != "order_cases"},
                cases=[OrderCase(**c) for c in (r.get("order_cases") or [])],
            )
            for r in (result.data or [])
        ]
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
            .select("id,raw_data,limit_delivery_date")
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

    def update_urgency(self, record_id: str, urgency: str) -> None:
        self.db.table(self.table).update({"urgency": urgency}).eq("id", record_id).execute()

    def get_active_orders_with_cases(self) -> list[dict]:
        """Return active orders that have at least one case, with their cases attached."""
        cases_result = (
            self.db.table("order_cases")
            .select("*")
            .not_.is_("order_id", "null")
            .is_("delayed_order_id", "null")
            .execute()
        )
        case_rows = cases_result.data or []
        if not case_rows:
            return []
        from collections import defaultdict
        cases_by_order: dict[str, list] = defaultdict(list)
        for row in case_rows:
            cases_by_order[row["order_id"]].append(row)
        order_ids = list(cases_by_order.keys())
        orders_result = self.db.table("orders").select("*").in_("id", order_ids).execute()
        return [
            {"order": r, "cases": cases_by_order[r["id"]]}
            for r in (orders_result.data or [])
        ]

    def get_order_ids_with_cases(self, order_ids: list[str]) -> set[str]:
        """Return the subset of order_ids that have at least one case."""
        if not order_ids:
            return set()
        result = (
            self.db.table("order_cases")
            .select("order_id")
            .in_("order_id", order_ids)
            .execute()
        )
        return {r["order_id"] for r in (result.data or []) if r.get("order_id")}

    def get_cases_for_active_order(self, order_id: str) -> list:
        from models.order import OrderCase
        result = self.db.table("order_cases").select("*").eq("order_id", order_id).order("created_at").execute()
        return [OrderCase(**r) for r in (result.data or [])]

    def add_case_for_active_order(self, order_id: str, case_number, case_status, comments):
        from models.order import OrderCase
        result = self.db.table("order_cases").insert({
            "order_id": order_id,
            "case_number": case_number,
            "case_status": case_status,
            "comments": comments,
        }).execute()
        return OrderCase(**result.data[0])

    def refresh_missing_comprobantes(self) -> int:
        """Fetch and save comprobantes for orders missing one.

        For Welivery-handled orders (ML Flex, Falabella Direct, Shopify): fetch from Welivery API.
        For other orders (Paris, etc.): use tracking link as fallback.
        """
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
            comprobante = None
            if _should_fetch_comprobante(o):
                welivery_id = _get_welivery_id(o)
                if welivery_id:
                    comprobante = get_comprobante(welivery_id)
            if not comprobante:
                comprobante = _get_tracking_link(o)
            if comprobante:
                self.db.table(self.table).update({"comprobante": comprobante}).eq("id", row["id"]).execute()
                updated += 1
        return updated

    def add_case(self, delayed_order_id: str, case_number: str | None, case_status: str | None, comments: str | None) -> OrderCase:
        result = self.db.table("order_cases").insert({
            "delayed_order_id": delayed_order_id,
            "case_number": case_number,
            "case_status": case_status,
            "comments": comments,
        }).execute()
        return OrderCase(**result.data[0])

    def delete_case(self, case_id: str) -> None:
        self.db.table("order_cases").delete().eq("id", case_id).execute()

    def update_case_info(self, record_id: str, case_number: str | None, comments: str | None, case_status: str | None = None) -> None:
        """Update case fields (number, comments, status) for a historical order."""
        self.db.table(self.table).update({
            "case_number": case_number,
            "comments": comments,
            "case_status": case_status,
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

    def get_kpi_metrics(self) -> dict:
        """Return aggregate % delayed grouped by month and by week (ISO Monday-Sunday).

        Includes blame breakdown (bodega vs transportista) per period.
        """
        result = self.db.table(self.table).select(
            "limit_delivery_date,days_delayed,blame"
        ).execute()
        rows = result.data or []

        monthly: dict[str, dict] = defaultdict(lambda: {"total": 0, "delayed": 0, "bodega": 0, "transportista": 0})
        weekly: dict[str, dict] = defaultdict(lambda: {"total": 0, "delayed": 0, "bodega": 0, "transportista": 0})

        for r in rows:
            raw_date = r.get("limit_delivery_date", "")
            days = r.get("days_delayed")
            blame = r.get("blame")
            if not raw_date or days is None:
                continue
            month = str(raw_date)[:7]
            monthly[month]["total"] += 1
            if float(days) > 0:
                monthly[month]["delayed"] += 1
                if blame == "bodega":
                    monthly[month]["bodega"] += 1
                elif blame == "transportista":
                    monthly[month]["transportista"] += 1
            # ISO week (Monday-based)
            try:
                dt = datetime.fromisoformat(str(raw_date)[:10])
                iso_year, iso_week, _ = dt.isocalendar()
                # Compute Monday of that ISO week for display
                from datetime import timedelta
                monday = dt - timedelta(days=dt.weekday())
                week_key = monday.strftime("%Y-%m-%d")
            except Exception:
                continue
            weekly[week_key]["total"] += 1
            if float(days) > 0:
                weekly[week_key]["delayed"] += 1
                if blame == "bodega":
                    weekly[week_key]["bodega"] += 1
                elif blame == "transportista":
                    weekly[week_key]["transportista"] += 1

        def build_list(buckets: dict) -> list[dict]:
            out = []
            for key in sorted(buckets.keys()):
                b = buckets[key]
                pct = round(b["delayed"] / b["total"] * 100, 1) if b["total"] > 0 else 0
                out.append({
                    "period": key,
                    "total": b["total"],
                    "delayed": b["delayed"],
                    "pct_delayed": pct,
                    "bodega": b["bodega"],
                    "transportista": b["transportista"],
                })
            return out

        return {"monthly": build_list(monthly), "weekly": build_list(weekly)}

    def get_blame_counts(self) -> dict:
        """Return counts of delays by blame (bodega vs transportista).

        Returns last 30 days + all-time counts.
        """
        from datetime import timedelta
        result = self.db.table(self.table).select(
            "blame,days_delayed,resolved_at"
        ).gt("days_delayed", 0).execute()
        rows = result.data or []

        cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
        total_bodega = total_transportista = 0
        recent_bodega = recent_transportista = 0

        for r in rows:
            blame = r.get("blame")
            resolved = r.get("resolved_at") or ""
            if blame == "bodega":
                total_bodega += 1
                if resolved >= cutoff:
                    recent_bodega += 1
            elif blame == "transportista":
                total_transportista += 1
                if resolved >= cutoff:
                    recent_transportista += 1

        return {
            "bodega": total_bodega,
            "transportista": total_transportista,
            "bodega_recent": recent_bodega,
            "transportista_recent": recent_transportista,
        }

    def get_historical_metrics(self) -> dict:
        """Return on-time and delayed metrics grouped by month and week, per source/logistics_operator."""
        from datetime import timedelta
        result = self.db.table(self.table).select(
            "source,limit_delivery_date,days_delayed,logistics_operator"
        ).execute()
        rows = result.data or []

        delayed_monthly: dict[tuple, list[float]] = defaultdict(list)
        on_time_monthly: dict[tuple, int] = defaultdict(int)
        delayed_weekly: dict[tuple, list[float]] = defaultdict(list)
        on_time_weekly: dict[tuple, int] = defaultdict(int)

        for r in rows:
            raw_date = r.get("limit_delivery_date", "")
            source = r.get("source", "")
            days = r.get("days_delayed")
            operator = r.get("logistics_operator") or "Sin especificar"
            if not raw_date or not source or days is None:
                continue
            month = str(raw_date)[:7]
            is_delayed = float(days) > 0
            if is_delayed:
                delayed_monthly[(month, source, operator)].append(float(days))
            else:
                on_time_monthly[(month, source, operator)] += 1
            # Weekly bucket
            try:
                dt = datetime.fromisoformat(str(raw_date)[:10])
                monday = dt - timedelta(days=dt.weekday())
                week_key = monday.strftime("%Y-%m-%d")
            except Exception:
                continue
            if is_delayed:
                delayed_weekly[(week_key, source, operator)].append(float(days))
            else:
                on_time_weekly[(week_key, source, operator)] += 1

        def build_delayed(buckets):
            return [
                DelayMetric(month=period, source=src, logistics_operator=op,
                            count=len(dl), avg_days_delayed=round(sum(dl) / len(dl), 1))
                for (period, src, op), dl in sorted(buckets.items())
            ]

        def build_on_time(buckets):
            return [
                OnTimeMetric(month=period, source=src, logistics_operator=op, count=cnt)
                for (period, src, op), cnt in sorted(buckets.items())
            ]

        return {
            "delayed": build_delayed(delayed_monthly),
            "on_time": build_on_time(on_time_monthly),
            "delayed_weekly": build_delayed(delayed_weekly),
            "on_time_weekly": build_on_time(on_time_weekly),
        }
