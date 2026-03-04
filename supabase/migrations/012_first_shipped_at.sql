-- Add first_shipped_at to orders table for Falabella Regular orders.
-- Falabella can transition through "shipped" multiple times (seller→carrier, carrier→route).
-- UpdatedAt in raw_data gets overwritten each time. This column freezes the first occurrence.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_shipped_at TIMESTAMPTZ;

-- Trigger function: capture UpdatedAt from first item when status first becomes 'shipped'.
-- Uses COALESCE logic: if already set, preserve; if new shipped transition, capture from raw_data.
CREATE OR REPLACE FUNCTION capture_first_shipped_at()
RETURNS TRIGGER AS $$
DECLARE
    item_updated_at TEXT;
BEGIN
    -- Only applies to Falabella orders transitioning to 'shipped'
    IF NEW.source = 'falabella' AND NEW.status = 'shipped' THEN
        IF OLD IS NULL OR OLD.first_shipped_at IS NULL THEN
            -- First time reaching 'shipped': extract UpdatedAt from first item
            item_updated_at := NEW.raw_data->'_items'->0->>'UpdatedAt';
            IF item_updated_at IS NOT NULL THEN
                NEW.first_shipped_at := item_updated_at::TIMESTAMPTZ;
            END IF;
        ELSE
            -- Already captured: preserve the original value
            NEW.first_shipped_at := OLD.first_shipped_at;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_capture_first_shipped ON orders;
CREATE TRIGGER orders_capture_first_shipped
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION capture_first_shipped_at();
