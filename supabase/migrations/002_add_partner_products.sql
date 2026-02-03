-- Migration: Create partner_products cache table for partner catalog

CREATE TABLE IF NOT EXISTS partner_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_shop TEXT NOT NULL,
  partner_product_id TEXT NOT NULL,
  partner_variant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sku TEXT,
  price NUMERIC(10,2) NOT NULL,
  inventory_quantity INTEGER,
  is_new BOOLEAN DEFAULT true,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(partner_shop, partner_variant_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_partner_products_shop ON partner_products(partner_shop);
CREATE INDEX IF NOT EXISTS idx_partner_products_is_new ON partner_products(is_new);

-- Enable RLS
ALTER TABLE partner_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to partner_products"
  ON partner_products FOR ALL
  USING (true)
  WITH CHECK (true);
