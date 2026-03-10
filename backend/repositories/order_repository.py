from database import get_supabase
from models.order import Order, OrderCreate, OrdersPage, OrderUrgency, compute_urgency, _today_santiago
from datetime import timedelta, date
from typing import Optional


_PENDING_LIKE = ["pending", "ready_to_ship"]


def _classify_shipping_method(source: str, logistics_operator: str) -> str:
    """Classify order into 'Express', 'Direct/Flex', or 'Regular/Centro Envíos'."""
    lo = (logistics_operator or "").lower()
    if source.startswith("shopify"):
        return "Express" if "express" in lo else "Regular/Centro Envíos"
    if source == "falabella":
        return "Direct/Flex" if lo == "direct" else "Regular/Centro Envíos"
    if source == "mercadolibre":
        return "Direct/Flex" if lo in ("flex", "self_service") else "Regular/Centro Envíos"
    return "Regular/Centro Envíos"


def _extract_logistics_operator(source: str, raw_data: dict) -> str | None:
    if source.startswith("shopify"):
        tags = (raw_data.get("tags") or "").lower()
        if "express" in [t.strip() for t in tags.split(",")]:
            return "Welivery - express"
        return "Welivery"
    if source == "mercadolibre":
        return raw_data.get("delivery_mode") or None
    if source == "walmart":
        return "standard"
    if source == "paris":
        sub_orders = raw_data.get("subOrders") or []
        if sub_orders:
            carrier = (sub_orders[0].get("carrier") or "").strip()
            return carrier if carrier else "standard"
        return "standard"
    spt = (raw_data.get("ShippingProviderType") or "").strip().lower()
    if spt == "regular":
        provider = (raw_data.get("ShippingProvider") or "").strip().lower()
        return f"regular - {provider}" if provider else "regular"
    if spt in ("direct", "falaflex"):
        return "direct"
    return spt or None


def _extract_city_commune(source: str, raw_data: dict) -> tuple[str | None, str | None]:
    if source.startswith("shopify"):
        addr = raw_data.get("shipping_address") or {}
        # Shopify Chile: "city" is actually the commune, "province" is the city/region
        city = addr.get("province") or None
        commune = addr.get("city") or None
        return city, commune
    if source == "falabella":
        addr = raw_data.get("AddressShipping") or {}
        city = addr.get("City") or None
        ward = str(addr.get("Ward") or "")
        parts = ward.split(" - ")
        commune = parts[-1].strip() if len(parts) > 1 else (ward.strip() or None)
        return city, commune
    if source == "mercadolibre":
        shipment = raw_data.get("shipment") or {}
        addr = shipment.get("receiver_address") or {}
        city_obj = addr.get("city") or {}
        neigh_obj = addr.get("neighborhood") or {}
        state_obj = addr.get("state") or {}
        city_name = city_obj.get("name") or None
        state_id = str(state_obj.get("id") or "")
        city = "Santiago" if state_id == "CL-RM" else city_name
        commune = neigh_obj.get("name") or city_name
        return city, commune
    if source == "walmart":
        shipping = raw_data.get("shippingInfo") or {}
        addr = shipping.get("postalAddress") or {}
        city = addr.get("city") or None
        commune = addr.get("state") or None
        return city, commune
    if source == "paris":
        sub_orders = raw_data.get("subOrders") or []
        if sub_orders:
            addr = sub_orders[0].get("shippingAddress") or {}
            city = addr.get("city") or None
            commune = addr.get("communaCode") or addr.get("stateCode") or None
            return city, commune
        return None, None
    return None, None


def _split_filter(value: str | None) -> list[str] | None:
    """Parse comma-separated filter value into a list for .in_() queries."""
    if not value:
        return None
    parts = [v.strip() for v in value.split(",") if v.strip()]
    return parts if parts else None


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
        records = []
        for o in orders:
            city, commune = _extract_city_commune(o.source, o.raw_data or {})
            records.append({
                "external_id": o.external_id,
                "source": o.source,
                "status": o.status,
                "created_at_source": o.created_at_source.isoformat() if o.created_at_source else None,
                "address_updated_at": o.address_updated_at.isoformat() if o.address_updated_at else None,
                "limit_delivery_date": o.limit_delivery_date.isoformat(),
                "limit_handoff_date": o.limit_handoff_date.isoformat() if o.limit_handoff_date else o.limit_delivery_date.isoformat(),
                "urgency": compute_urgency(o.limit_delivery_date, o.status).value,
                "product_name": o.product_name,
                "product_quantity": o.product_quantity,
                "logistics_operator": _extract_logistics_operator(o.source, o.raw_data or {}),
                "city": city,
                "commune": commune,
                "raw_data": o.raw_data,
            })
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
        product_name: Optional[str] = None,
        logistics_operator: Optional[str] = None,
        city: Optional[str] = None,
        commune: Optional[str] = None,
        order_number: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
        perspective: str = "bodega",
    ) -> OrdersPage:
        query = self.db.table(self.table).select("*", count="exact")
        if source:
            query = query.eq("source", source)
        if order_number:
            query = query.or_(f"external_id.ilike.%{order_number}%,raw_data->>OrderNumber.ilike.%{order_number}%")
        status_parts = _split_filter(status)
        if status_parts:
            query = query.in_("status", status_parts)
        elif perspective == "bodega":
            query = query.in_("status", _PENDING_LIKE)
        elif perspective == "cliente":
            query = query.eq("status", "shipped")
        if product_name:
            query = query.ilike("product_name", f"%{product_name}%")
        lo_parts = _split_filter(logistics_operator)
        if lo_parts:
            query = query.in_("logistics_operator", lo_parts)
        if city:
            query = query.eq("city", city)
        if commune:
            query = query.ilike("commune", f"%{commune}%")
        # Urgency filter
        urgency_parts = _split_filter(urgency)
        if urgency_parts and len(urgency_parts) == 1:
            u = urgency_parts[0]
            if u == OrderUrgency.OVERDUE:
                query = query.in_("status", _PENDING_LIKE).lt("limit_delivery_date", _today_iso())
            elif u == OrderUrgency.DUE_TODAY:
                query = query.in_("status", _PENDING_LIKE).gte("limit_delivery_date", _today_iso()).lt("limit_delivery_date", _tomorrow_iso())
            elif u == OrderUrgency.DELIVERED_TODAY:
                query = query.eq("status", "shipped").gte("limit_delivery_date", _today_iso()).lt("limit_delivery_date", _tomorrow_iso())
            elif u == OrderUrgency.TOMORROW:
                query = query.in_("status", _PENDING_LIKE).gte("limit_delivery_date", _tomorrow_iso()).lt("limit_delivery_date", _day_after_tomorrow_iso())
            elif u == OrderUrgency.TWO_OR_MORE_DAYS:
                query = query.in_("status", list(_PENDING_LIKE)).gte("limit_delivery_date", _day_after_tomorrow_iso())
            elif u == OrderUrgency.ON_TIME:
                query = query.not_.in_("status", list(_PENDING_LIKE)).gte("limit_delivery_date", _day_after_tomorrow_iso())
            elif u == "active":
                query = query.in_("status", _PENDING_LIKE).lt("limit_delivery_date", _day_after_tomorrow_iso())
        elif urgency_parts:
            # Multiple urgency values → filter by stored urgency column
            query = query.in_("urgency", urgency_parts)

        sort_field = "limit_handoff_date" if perspective == "bodega" else "limit_delivery_date"
        offset = (page - 1) * per_page
        result = query.order(sort_field).range(offset, offset + per_page - 1).execute()
        total = result.count or 0
        orders = [Order(**r) for r in (result.data or [])]

        # Bodega perspective: recompute urgency from limit_handoff_date so it
        # matches the summary cards (which also use handoff date).
        if perspective == "bodega":
            for o in orders:
                ref = o.limit_handoff_date or o.limit_delivery_date
                o.urgency = compute_urgency(ref, o.status)

        # Cliente perspective: orders with real client delivery date first
        if perspective == "cliente":
            def _has_client_date(o: Order) -> int:
                if o.source.startswith("shopify"):
                    return 0  # Shopify always has client date
                lo = (o.raw_data or {}).get("logistics_operator", "") or ""
                method = _classify_shipping_method(o.source, lo)
                return 0 if method in ("Direct/Flex", "Express") else 1
            orders.sort(key=lambda o: (_has_client_date(o), o.limit_delivery_date))

        pages = (total + per_page - 1) // per_page if total else 0
        return OrdersPage(data=orders, total=total, page=page, per_page=per_page, pages=pages)

    def get_summary_counts(
        self,
        source: Optional[str] = None,
        status: Optional[str] = None,
        urgency: Optional[str] = None,
        product_name: Optional[str] = None,
        logistics_operator: Optional[str] = None,
        city: Optional[str] = None,
        commune: Optional[str] = None,
        order_number: Optional[str] = None,
        perspective: str = "bodega",
    ) -> dict:
        """Count orders by urgency, respecting active filters.

        perspective controls which date is used for urgency:
        - "bodega": uses limit_handoff_date (warehouse → carrier deadline)
        - "cliente": uses limit_delivery_date (carrier → end customer deadline)
          For cliente, Regular/CE orders (where both dates are the same) show as "-"

        Also returns a breakdown dict: { urgency_key: [{source, method, count}] }
        """
        # For bodega: recompute urgency from limit_handoff_date
        # For cliente: use stored urgency (based on limit_delivery_date)
        fields = "urgency,status,source,logistics_operator,limit_handoff_date,limit_delivery_date"
        query = self.db.table(self.table).select(fields)
        if source:
            query = query.eq("source", source)
        if order_number:
            query = query.or_(f"external_id.ilike.%{order_number}%,raw_data->>OrderNumber.ilike.%{order_number}%")
        status_parts = _split_filter(status)
        if status_parts:
            query = query.in_("status", status_parts)
        elif perspective == "bodega":
            query = query.in_("status", _PENDING_LIKE)
        elif perspective == "cliente":
            query = query.eq("status", "shipped")
        # When using bodega perspective, don't filter by stored urgency since we recompute
        if perspective != "bodega":
            urgency_parts = _split_filter(urgency)
            if urgency_parts:
                query = query.in_("urgency", urgency_parts)
        if product_name:
            query = query.ilike("product_name", f"%{product_name}%")
        lo_parts = _split_filter(logistics_operator)
        if lo_parts:
            query = query.in_("logistics_operator", lo_parts)
        if city:
            query = query.eq("city", city)
        if commune:
            query = query.ilike("commune", f"%{commune}%")
        rows = (query.execute()).data or []
        overdue = due_today = delivered_today = tomorrow_count = two_or_more_days = on_time = 0
        breakdown_buckets: dict[str, dict[tuple[str, str], int]] = {}

        from datetime import datetime as dt_class
        for r in rows:
            src = r.get("source") or ""
            lo = r.get("logistics_operator") or ""
            method = _classify_shipping_method(src, lo)
            row_status = r.get("status") or ""

            if perspective == "bodega":
                # Recompute urgency from limit_handoff_date
                handoff_raw = r.get("limit_handoff_date")
                if not handoff_raw:
                    handoff_raw = r.get("limit_delivery_date")
                if not handoff_raw:
                    continue
                if isinstance(handoff_raw, str):
                    handoff_dt = dt_class.fromisoformat(handoff_raw)
                else:
                    handoff_dt = handoff_raw
                u = compute_urgency(handoff_dt, row_status).value
            elif perspective == "cliente":
                # Shopify always penalizes (Welivery delivers to client)
                # Regular/CE from Falabella, ML, Walmart, Paris → no penalty
                is_shopify = src.startswith("shopify")
                is_client_delivery = method in ("Direct/Flex", "Express") or is_shopify
                if not is_client_delivery:
                    u = "on_time"
                else:
                    u = r.get("urgency") or ""
            else:
                u = r.get("urgency") or ""

            if u == "overdue":
                overdue += 1
            elif u == "due_today":
                due_today += 1
            elif u == "delivered_today":
                delivered_today += 1
            elif u == "tomorrow":
                tomorrow_count += 1
            elif u == "two_or_more_days":
                two_or_more_days += 1
            elif u == "on_time":
                on_time += 1
            else:
                continue
            bucket = breakdown_buckets.setdefault(u, {})
            key = (src, method)
            bucket[key] = bucket.get(key, 0) + 1

        # Also build a "total" breakdown (all card urgencies, including delivered_today)
        total_bucket: dict[tuple[str, str], int] = {}
        for urg_key in ("overdue", "due_today", "delivered_today", "tomorrow", "two_or_more_days"):
            for key, cnt in breakdown_buckets.get(urg_key, {}).items():
                total_bucket[key] = total_bucket.get(key, 0) + cnt
        breakdown_buckets["total"] = total_bucket

        breakdown = {
            urg: [
                {"source": src, "method": method, "count": cnt}
                for (src, method), cnt in sorted(bucket.items())
            ]
            for urg, bucket in breakdown_buckets.items()
        }
        total = overdue + due_today + delivered_today + tomorrow_count + two_or_more_days + on_time
        return {
            "total": total,
            "overdue": overdue,
            "due_today": due_today,
            "delivered_today": delivered_today,
            "tomorrow": tomorrow_count,
            "two_or_more_days": two_or_more_days,
            "on_time": on_time,
            "breakdown": breakdown,
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
        communes = sorted({r["commune"] for r in (result.data or []) if r.get("commune")})
        return communes

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
