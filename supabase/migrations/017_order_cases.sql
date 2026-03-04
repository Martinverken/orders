-- Multi-ticket support: each historical order can have multiple case entries
CREATE TABLE order_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delayed_order_id UUID NOT NULL REFERENCES delayed_orders(id) ON DELETE CASCADE,
  case_number TEXT,
  case_status TEXT CHECK (case_status IN ('created', 'pending', 'resolved')),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_cases_delayed_order_id ON order_cases(delayed_order_id);
