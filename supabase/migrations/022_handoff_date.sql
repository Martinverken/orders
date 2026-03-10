-- Add limit_handoff_date (warehouse → carrier deadline) to active orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS limit_handoff_date TIMESTAMPTZ;

-- Backfill: default to limit_delivery_date for all existing orders
-- Next sync cycle will set correct values per source/method
UPDATE orders SET limit_handoff_date = limit_delivery_date WHERE limit_handoff_date IS NULL;

-- Add handoff tracking to historical orders
ALTER TABLE delayed_orders ADD COLUMN IF NOT EXISTS limit_handoff_date TIMESTAMPTZ;
ALTER TABLE delayed_orders ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ;
ALTER TABLE delayed_orders ADD COLUMN IF NOT EXISTS blame TEXT;  -- 'bodega' | 'transportista' | NULL
