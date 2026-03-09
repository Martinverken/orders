-- SKU Master: catálogo de productos con dimensiones y peso para cálculo de envío
CREATE TABLE IF NOT EXISTS sku_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    weight_kg NUMERIC(8,2) NOT NULL,
    height_cm NUMERIC(8,2) NOT NULL,
    width_cm NUMERIC(8,2) NOT NULL,
    length_cm NUMERIC(8,2) NOT NULL,
    -- Computed: suma de los 3 lados (alto + ancho + largo)
    sum_sides_cm NUMERIC(8,2) GENERATED ALWAYS AS (height_cm + width_cm + length_cm) STORED,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index para búsqueda por SKU
CREATE INDEX IF NOT EXISTS idx_sku_master_sku ON sku_master (sku);
