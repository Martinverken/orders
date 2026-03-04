"""
One-time backfill script: fix limit_delivery_date for all active ML Centro de Envíos orders.

Run from backend/ directory:
    python scripts/fix_ml_ce_deadlines.py

Requires ML_CE_CUTOFF_SCHEDULE env var to be set (or set in .env file).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import json
from supabase import create_client

from integrations.mercadolibre.mapper import (
    _SANTIAGO,
    _WEEKDAY_NAMES,
    _ML_CE_SCHEDULE,
    parse_ml_datetime,
    _resolve_ce_deadline_from_schedule,
)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

CE_LOGISTIC_TYPES = {"xd_drop_off", "cross_docking", "drop_off"}


def main():
    if not _ML_CE_SCHEDULE:
        print("ERROR: ML_CE_CUTOFF_SCHEDULE env var is not set. Aborting.")
        sys.exit(1)

    print(f"Using CE schedule: {json.dumps(_ML_CE_SCHEDULE)}")

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch all active ML orders
    resp = client.table("orders").select("id,external_id,limit_delivery_date,raw_data").eq("source", "mercadolibre").execute()
    orders = resp.data
    print(f"Found {len(orders)} active ML orders")

    updated = 0
    skipped = 0
    errors = 0

    for order in orders:
        try:
            raw = order.get("raw_data") or {}
            shipment = raw.get("shipment") or {}
            logistic_type = str(shipment.get("logistic_type") or "").lower()

            if logistic_type not in CE_LOGISTIC_TYPES:
                skipped += 1
                continue

            sh = shipment.get("status_history") or {}
            date_handling_str = sh.get("date_handling")
            if not date_handling_str:
                print(f"  Order {order['external_id']}: no date_handling — skipping")
                skipped += 1
                continue

            date_handling = parse_ml_datetime(date_handling_str)
            if not date_handling:
                print(f"  Order {order['external_id']}: could not parse date_handling {date_handling_str} — skipping")
                skipped += 1
                continue

            new_deadline = _resolve_ce_deadline_from_schedule(date_handling)
            if not new_deadline:
                print(f"  Order {order['external_id']}: no matching schedule day — skipping")
                skipped += 1
                continue

            # Compare with current stored value
            current_str = order.get("limit_delivery_date")
            current_dt = datetime.fromisoformat(current_str) if current_str else None

            new_iso = new_deadline.isoformat()

            if current_dt and abs((current_dt - new_deadline).total_seconds()) < 60:
                # Already correct (within 1 minute)
                skipped += 1
                continue

            print(f"  Order {order['external_id']} ({logistic_type}): {current_str} → {new_iso}")
            client.table("orders").update({"limit_delivery_date": new_iso}).eq("id", order["id"]).execute()
            updated += 1

        except Exception as e:
            print(f"  Order {order.get('external_id', '?')}: ERROR — {e}")
            errors += 1

    print(f"\nDone. Updated: {updated}, Skipped: {skipped}, Errors: {errors}")


if __name__ == "__main__":
    main()
