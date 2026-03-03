-- Migration 002: Delayed orders tracking for monthly metrics

CREATE TABLE delayed_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id         TEXT NOT NULL,
    source              TEXT NOT NULL,
    limit_delivery_date TIMESTAMPTZ NOT NULL,
    resolved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    days_delayed        NUMERIC GENERATED ALWAYS AS (
        ROUND(EXTRACT(EPOCH FROM (resolved_at - limit_delivery_date)) / 86400.0, 1)
    ) STORED,
    raw_data            JSONB,
    UNIQUE(external_id, source)
);

CREATE INDEX idx_delayed_month  ON delayed_orders (limit_delivery_date);
CREATE INDEX idx_delayed_source ON delayed_orders (source);
