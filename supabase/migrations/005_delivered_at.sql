-- Replace days_delayed (which depended on resolved_at) with one that uses delivered_at when available
ALTER TABLE delayed_orders DROP COLUMN days_delayed;
ALTER TABLE delayed_orders ADD COLUMN delivered_at TIMESTAMPTZ;
ALTER TABLE delayed_orders ADD COLUMN days_delayed NUMERIC GENERATED ALWAYS AS (
    ROUND(EXTRACT(EPOCH FROM (COALESCE(delivered_at, resolved_at) - limit_delivery_date)) / 86400.0, 1)
) STORED;
