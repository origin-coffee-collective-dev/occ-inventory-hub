-- Migration: Add partner_price and my_price columns to product_mappings

ALTER TABLE product_mappings
  ADD COLUMN IF NOT EXISTS partner_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS my_price NUMERIC(10,2);
