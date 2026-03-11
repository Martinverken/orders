-- Multi-bulto fix: use MAX(UpdatedAt) across ALL items instead of just the first item.
-- For orders with multiple packages, the order is only 'shipped'/'delivered' when ALL
-- items reach that status. MAX(UpdatedAt) = when the LAST item reached the milestone.

CREATE OR REPLACE FUNCTION capture_first_shipped_at()
RETURNS TRIGGER AS $$
DECLARE
    max_updated_at TEXT;
    item_updated_at TEXT;
BEGIN
    IF NEW.source = 'falabella' THEN
        -- Use MAX(UpdatedAt) across ALL items for multi-bulto accuracy.
        -- If _items has multiple entries, we want the latest UpdatedAt (last item to reach status).
        IF jsonb_array_length(COALESCE(NEW.raw_data->'_items', '[]'::jsonb)) > 1 THEN
            SELECT MAX(elem->>'UpdatedAt') INTO max_updated_at
            FROM jsonb_array_elements(NEW.raw_data->'_items') AS elem
            WHERE elem->>'UpdatedAt' IS NOT NULL;
        ELSE
            max_updated_at := NEW.raw_data->'_items'->0->>'UpdatedAt';
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
