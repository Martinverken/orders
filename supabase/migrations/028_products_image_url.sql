-- Add image_url column to products table for Shopify product images
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
