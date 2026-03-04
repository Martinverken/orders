-- Add case management fields to delayed_orders for team tracking of delayed shipments.
ALTER TABLE delayed_orders
  ADD COLUMN IF NOT EXISTS case_number TEXT,
  ADD COLUMN IF NOT EXISTS comments    TEXT;
