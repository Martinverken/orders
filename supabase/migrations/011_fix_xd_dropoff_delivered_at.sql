-- Fix delivered_at for xd_drop_off (Centro de Envíos drop-off) orders.
-- For these orders, date_shipped is set by ML's logistics hub — not the seller.
-- The correct seller action date is substatus_history[dropped_off].date.
UPDATE delayed_orders
SET delivered_at = (
    SELECT (elem->>'date')::TIMESTAMPTZ
    FROM jsonb_array_elements(raw_data->'shipment'->'substatus_history') AS elem
    WHERE elem->>'substatus' = 'dropped_off'
    LIMIT 1
)
WHERE source = 'mercadolibre'
  AND raw_data->'shipment'->>'logistic_type' = 'xd_drop_off'
  AND (
    SELECT (elem->>'date')::TIMESTAMPTZ
    FROM jsonb_array_elements(raw_data->'shipment'->'substatus_history') AS elem
    WHERE elem->>'substatus' = 'dropped_off'
    LIMIT 1
  ) IS NOT NULL;
