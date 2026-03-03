-- Migration 004: Add urgency + product columns
-- Run this in Supabase SQL editor

-- orders table: store urgency at sync time + product info
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS urgency         TEXT,
    ADD COLUMN IF NOT EXISTS product_name    TEXT,
    ADD COLUMN IF NOT EXISTS product_quantity INTEGER;

-- delayed_orders table: store the urgency at the moment the order was last seen
-- This is the source of truth for on-time vs late classification
ALTER TABLE delayed_orders
    ADD COLUMN IF NOT EXISTS urgency TEXT;
