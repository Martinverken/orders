-- Add first_ready_to_ship_at to capture when bodega marked the order as ready for pickup.
-- For Falabella Regular, this is the bodega's handoff action (listo para despachar).
-- first_shipped_at captures when the carrier picked it up, which is a different event.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS first_ready_to_ship_at TIMESTAMPTZ;

-- Update trigger to also capture ready_to_ship timestamp
CREATE OR REPLACE FUNCTION capture_first_shipped_at()
RETURNS TRIGGER AS $$
DECLARE
    max_updated_at TEXT;
    item_updated_at TEXT;
BEGIN
    IF NEW.source = 'falabella' THEN
        -- Use MAX(UpdatedAt) across ALL items for multi-bulto accuracy.
        IF jsonb_array_length(COALESCE(NEW.raw_data->'_items', '[]'::jsonb)) > 1 THEN
            SELECT MAX(elem->>'UpdatedAt') INTO max_updated_at
            FROM jsonb_array_elements(NEW.raw_data->'_items') AS elem
            WHERE elem->>'UpdatedAt' IS NOT NULL;
        ELSE
            max_updated_at := NEW.raw_data->'_items'->0->>'UpdatedAt';
        END IF;

        -- Freeze first 'ready_to_ship' timestamp (bodega's action)
        IF NEW.status = 'ready_to_ship' THEN
            IF OLD IS NULL OR OLD.first_ready_to_ship_at IS NULL THEN
                IF max_updated_at IS NOT NULL THEN
                    NEW.first_ready_to_ship_at := max_updated_at::TIMESTAMP AT TIME ZONE 'America/Santiago';
                END IF;
            ELSE
                NEW.first_ready_to_ship_at := OLD.first_ready_to_ship_at;
            END IF;
        END IF;

        -- Preserve first_ready_to_ship_at when status changes to shipped/delivered
        IF NEW.status IN ('shipped', 'delivered') AND OLD IS NOT NULL AND OLD.first_ready_to_ship_at IS NOT NULL THEN
            NEW.first_ready_to_ship_at := OLD.first_ready_to_ship_at;
        END IF;

        -- Freeze first 'shipped' timestamp
        IF NEW.status = 'shipped' THEN
            IF OLD IS NULL OR OLD.first_shipped_at IS NULL THEN
                IF max_updated_at IS NOT NULL THEN
                    NEW.first_shipped_at := max_updated_at::TIMESTAMP AT TIME ZONE 'America/Santiago';
                END IF;
            ELSE
                NEW.first_shipped_at := OLD.first_shipped_at;
            END IF;
        END IF;

        -- Freeze first 'delivered' timestamp
        IF NEW.status = 'delivered' THEN
            IF OLD IS NULL OR OLD.first_delivered_at IS NULL THEN
                IF max_updated_at IS NOT NULL THEN
                    NEW.first_delivered_at := max_updated_at::TIMESTAMP AT TIME ZONE 'America/Santiago';
                END IF;
            ELSE
                NEW.first_delivered_at := OLD.first_delivered_at;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
