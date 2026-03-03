-- ============================================================
-- Verken Orders Dashboard — Initial Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- ORDERS
-- Note: urgency (overdue/due_today/on_time) is computed in the application layer
-- based on limit_delivery_date vs the current date. Generated columns cannot use
-- CURRENT_DATE because it is not immutable.
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id         TEXT NOT NULL,
    source              TEXT NOT NULL,           -- 'falabella' | 'mercadolibre'
    status              TEXT NOT NULL,
    created_at_source   TIMESTAMPTZ,
    address_updated_at  TIMESTAMPTZ,
    limit_delivery_date TIMESTAMPTZ NOT NULL,
    raw_data            JSONB,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (external_id, source)
);

CREATE INDEX IF NOT EXISTS idx_orders_source         ON orders (source);
CREATE INDEX IF NOT EXISTS idx_orders_limit_delivery ON orders (limit_delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders (status);

-- SYNC LOGS
CREATE TABLE IF NOT EXISTS sync_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running',   -- 'running' | 'success' | 'error'
    orders_fetched  INTEGER DEFAULT 0,
    orders_upserted INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_source  ON sync_logs (source);

-- EMAIL NOTIFICATIONS
CREATE TABLE IF NOT EXISTS email_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    recipient       TEXT NOT NULL,
    subject         TEXT NOT NULL,
    overdue_count   INTEGER NOT NULL DEFAULT 0,
    due_today_count INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL,               -- 'sent' | 'error'
    resend_id       TEXT,
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at ON email_notifications (sent_at DESC);

-- Auto-update updated_at on orders
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
