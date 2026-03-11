-- Fix: Falabella UpdatedAt is Santiago local time, not UTC.
-- Casting bare text to TIMESTAMPTZ assumes UTC, losing 3 hours.
-- Fix: interpret as Santiago local time using AT TIME ZONE.

-- Update trigger function to handle timezone correctly
CREATE OR REPLACE FUNCTION capture_first_shipped_at()
RETURNS TRIGGER AS $$
DECLARE
    item_updated_at TEXT;
BEGIN
    -- Falabella: capture first 'shipped' timestamp from item UpdatedAt (Santiago local time)
    IF NEW.source = 'falabella' AND NEW.status = 'shipped' THEN
        IF OLD IS NULL OR OLD.first_shipped_at IS NULL THEN
            item_updated_at := NEW.raw_data->'_items'->0->>'UpdatedAt';
            IF item_updated_at IS NOT NULL THEN
                NEW.first_shipped_at := item_updated_at::TIMESTAMP AT TIME ZONE 'America/Santiago';
            END IF;
        ELSE
            NEW.first_shipped_at := OLD.first_shipped_at;
        END IF;
    END IF;

    -- Falabella: capture first 'delivered' timestamp
    IF NEW.source = 'falabella' AND NEW.status = 'delivered' THEN
        IF OLD IS NULL OR OLD.first_delivered_at IS NULL THEN
            item_updated_at := NEW.raw_data->'_items'->0->>'UpdatedAt';
            IF item_updated_at IS NOT NULL THEN
                NEW.first_delivered_at := item_updated_at::TIMESTAMP AT TIME ZONE 'America/Santiago';
            END IF;
        ELSE
            NEW.first_delivered_at := OLD.first_delivered_at;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix existing rows: reinterpret as Santiago local time
-- Current value was stored assuming UTC, but the text was actually Santiago.
-- Convert: strip timezone (get the local digits back), then re-interpret as Santiago.
UPDATE orders
SET first_shipped_at = (first_shipped_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago'
WHERE source = 'falabella'
  AND first_shipped_at IS NOT NULL;

UPDATE orders
SET first_delivered_at = (first_delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago'
WHERE source = 'falabella'
  AND first_delivered_at IS NOT NULL;

-- Also fix delayed_orders (archived historical data derived from wrong timestamps)
UPDATE delayed_orders
SET handoff_at = (handoff_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago'
WHERE source = 'falabella'
  AND handoff_at IS NOT NULL;

UPDATE delayed_orders
SET delivered_at = (delivered_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santiago'
WHERE source = 'falabella'
  AND delivered_at IS NOT NULL;

-- Increase days_delayed precision from 1 to 2 decimals so sub-hour delays are visible
ALTER TABLE delayed_orders DROP COLUMN days_delayed;
ALTER TABLE delayed_orders ADD COLUMN days_delayed NUMERIC GENERATED ALWAYS AS (
    ROUND(EXTRACT(EPOCH FROM (COALESCE(delivered_at, resolved_at) - limit_delivery_date)) / 86400.0, 2)
) STORED;
