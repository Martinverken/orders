ALTER TABLE couriers
  ADD COLUMN IF NOT EXISTS pickup_window_start TEXT;  -- HH:MM, e.g. "09:00" (start of typical pickup window)
