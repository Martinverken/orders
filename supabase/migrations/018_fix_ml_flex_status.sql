-- Fix ML Flex orders archived with stale "ready_to_ship" status that were actually delivered.
-- ML Flex orders are handled by Welivery; comprobante IS NOT NULL is proof of delivery.
UPDATE delayed_orders
SET status = 'delivered'
WHERE source = 'mercadolibre'
  AND status = 'ready_to_ship'
  AND comprobante IS NOT NULL;
