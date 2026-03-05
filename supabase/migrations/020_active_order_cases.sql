-- Allow order_cases to be linked to active orders (orders table) in addition to historical (delayed_orders)
-- delayed_order_id becomes nullable so a case can exist while the order is still active

ALTER TABLE order_cases ALTER COLUMN delayed_order_id DROP NOT NULL;

ALTER TABLE order_cases
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_cases_order_id ON order_cases(order_id);
