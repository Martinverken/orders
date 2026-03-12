-- Products catalog
CREATE TABLE products (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  sku        TEXT        NOT NULL UNIQUE,
  height_cm  NUMERIC(10,2),
  width_cm   NUMERIC(10,2),
  length_cm  NUMERIC(10,2),
  weight_kg  NUMERIC(10,3),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Couriers (tarificación y restricciones)
CREATE TABLE couriers (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT        NOT NULL,
  pricing_type TEXT,                      -- e.g. 'por_peso', 'por_dimensiones', 'mixto', 'tarifa_plana'
  base_price   NUMERIC(10,2),             -- precio base (CLP)
  price_per_kg NUMERIC(10,4),             -- precio por kg adicional
  max_weight_kg  NUMERIC(10,2),           -- restricción: peso máximo
  max_length_cm  NUMERIC(10,2),           -- restricción: largo máximo
  max_width_cm   NUMERIC(10,2),           -- restricción: ancho máximo
  max_height_cm  NUMERIC(10,2),           -- restricción: alto máximo
  notes        TEXT,                      -- restricciones adicionales / notas libres
  active       BOOLEAN     DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
