-- Pack items: composition of a pack product
-- Each entry: [{sku: text, quantity: integer}]
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_items JSONB;
