-- Re-calculate delivered_at for ALL ML orders in delayed_orders from stored raw_data.
-- Fixes orders where delivered_at was set incorrectly by old code and locked by immutability logic.
--
-- Priority per logistic_type:
--   xd_drop_off   → substatus_history[dropped_off].date   (seller drops at ML point)
--   self_service  → status_history.date_delivered         (Flex: seller delivers to customer)
--   cross_docking → status_history.date_ready_to_ship     (seller marks package ready)
--                   fallback: status_history.date_shipped  (carrier pickup)
--
-- days_delayed is a GENERATED column → recalculates automatically.

UPDATE delayed_orders
SET delivered_at = CASE
    -- xd_drop_off: use dropped_off substatus (when seller physically drops at ML point)
    WHEN raw_data->'shipment'->>'logistic_type' = 'xd_drop_off' THEN (
        SELECT (elem->>'date')::TIMESTAMPTZ
        FROM jsonb_array_elements(raw_data->'shipment'->'substatus_history') AS elem
        WHERE elem->>'substatus' = 'dropped_off'
        LIMIT 1
    )
    -- self_service (Flex): use date_delivered (seller delivers to customer)
    WHEN raw_data->'shipment'->>'logistic_type' = 'self_service' THEN
        (raw_data->'shipment'->'status_history'->>'date_delivered')::TIMESTAMPTZ
    -- cross_docking and other CE: date_ready_to_ship (seller prepared) → date_shipped (carrier pickup)
    ELSE COALESCE(
        (raw_data->'shipment'->'status_history'->>'date_ready_to_ship')::TIMESTAMPTZ,
        (raw_data->'shipment'->'status_history'->>'date_shipped')::TIMESTAMPTZ
    )
END
WHERE source = 'mercadolibre'
  AND raw_data->'shipment' IS NOT NULL;
