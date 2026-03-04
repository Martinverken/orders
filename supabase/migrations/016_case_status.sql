-- Add case_status to delayed_orders for team ticket workflow.
-- Values: 'created' | 'pending' | 'resolved' | NULL (no case opened)
ALTER TABLE delayed_orders
  ADD COLUMN IF NOT EXISTS case_status TEXT;
