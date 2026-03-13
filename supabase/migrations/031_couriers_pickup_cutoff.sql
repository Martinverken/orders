ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS pickup_cutoff TEXT;  -- HH:MM, e.g. "11:00"
