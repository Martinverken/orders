-- Settings key-value table for app configuration
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current ML CE cutoff schedule
-- (Wednesday=11:00, Thursday=14:45, Friday=11:00 for week of 2026-03-02)
INSERT INTO settings (key, value)
VALUES (
  'ml_ce_schedule',
  '{"monday":"11:00","tuesday":"11:00","wednesday":"11:00","thursday":"14:45","friday":"11:00","saturday":"11:00"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
