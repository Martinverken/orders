-- Migration 003: Add logistics operator to delayed_orders

ALTER TABLE delayed_orders ADD COLUMN logistics_operator TEXT;

CREATE INDEX idx_delayed_operator ON delayed_orders (logistics_operator);
