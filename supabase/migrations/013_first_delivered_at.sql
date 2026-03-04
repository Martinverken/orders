-- Add first_delivered_at to orders table for Falabella Direct (falaflex) orders.
-- Extends the existing trigger to also freeze the first 'delivered' timestamp.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_delivered_at TIMESTAMPTZ;

-- Replace trigger function to handle both shipped and delivered first-occurrence capture.
CREATE OR REPLACE FUNCTION capture_first_shipped_at()
RETURNS TRIGGER AS $$
DECLARE
    item_updated_at TEXT;
BEGIN
    IF NEW.source = 'falabella' THEN
        item_updated_at := NEW.raw_data->'_items'->0->>'UpdatedAt';

        -- Freeze first 'shipped' timestamp
        IF NEW.status = 'shipped' THEN
            IF OLD IS NULL OR OLD.first_shipped_at IS NULL THEN
                IF item_updated_at IS NOT NULL THEN
                    NEW.first_shipped_at := item_updated_at::TIMESTAMPTZ;
                END IF;
            ELSE
                NEW.first_shipped_at := OLD.first_shipped_at;
            END IF;
        END IF;

        -- Freeze first 'delivered' timestamp
        IF NEW.status = 'delivered' THEN
            IF OLD IS NULL OR OLD.first_delivered_at IS NULL THEN
                IF item_updated_at IS NOT NULL THEN
                    NEW.first_delivered_at := item_updated_at::TIMESTAMPTZ;
                END IF;
            ELSE
                NEW.first_delivered_at := OLD.first_delivered_at;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
