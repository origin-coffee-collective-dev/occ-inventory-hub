-- Migration: Add sessions table and soft-delete columns
-- Run this in your Supabase SQL Editor

-- 1. Create sessions table for Shopify session storage
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  state TEXT NOT NULL,
  is_online BOOLEAN DEFAULT false,
  scope TEXT,
  expires TIMESTAMP WITH TIME ZONE,
  access_token TEXT NOT NULL,
  user_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  account_owner BOOLEAN DEFAULT false,
  locale TEXT,
  collaborator BOOLEAN DEFAULT false,
  email_verified BOOLEAN DEFAULT false,
  refresh_token TEXT,
  refresh_token_expires TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sessions_shop ON sessions(shop);

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to sessions"
  ON sessions FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Add soft-delete columns to partners
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Make access_token nullable (for GDPR redact)
ALTER TABLE partners
  ALTER COLUMN access_token DROP NOT NULL;

-- Make scope nullable
ALTER TABLE partners
  ALTER COLUMN scope DROP NOT NULL;

-- 3. Add partner_shop and is_active to product_mappings
ALTER TABLE product_mappings
  ADD COLUMN IF NOT EXISTS partner_shop VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Populate partner_shop from existing partner relationships
UPDATE product_mappings pm
SET partner_shop = p.shop
FROM partners p
WHERE pm.partner_id = p.id
  AND pm.partner_shop IS NULL;

-- Make partner_shop NOT NULL after populating (if you have existing data)
-- Uncomment this after verifying data is populated:
-- ALTER TABLE product_mappings ALTER COLUMN partner_shop SET NOT NULL;

-- Make partner_id nullable (for soft delete)
ALTER TABLE product_mappings
  ALTER COLUMN partner_id DROP NOT NULL;

-- Update unique constraint to use partner_shop instead of partner_id
ALTER TABLE product_mappings
  DROP CONSTRAINT IF EXISTS product_mappings_partner_id_partner_variant_id_key;

-- Only add new constraint if partner_shop is populated
-- ALTER TABLE product_mappings
--   ADD CONSTRAINT product_mappings_partner_shop_partner_variant_id_key
--   UNIQUE (partner_shop, partner_variant_id);

-- 4. Add partner_shop to partner_orders
ALTER TABLE partner_orders
  ADD COLUMN IF NOT EXISTS partner_shop VARCHAR(255);

-- Populate partner_shop from existing partner relationships
UPDATE partner_orders po
SET partner_shop = p.shop
FROM partners p
WHERE po.partner_id = p.id
  AND po.partner_shop IS NULL;

-- Make partner_id nullable (for soft delete)
ALTER TABLE partner_orders
  ALTER COLUMN partner_id DROP NOT NULL;

-- 5. Update foreign key constraints to SET NULL instead of CASCADE
-- Drop existing foreign keys
ALTER TABLE product_mappings
  DROP CONSTRAINT IF EXISTS product_mappings_partner_id_fkey;

ALTER TABLE partner_orders
  DROP CONSTRAINT IF EXISTS partner_orders_partner_id_fkey;

-- Re-add with SET NULL
ALTER TABLE product_mappings
  ADD CONSTRAINT product_mappings_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

ALTER TABLE partner_orders
  ADD CONSTRAINT partner_orders_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

-- 6. Add index on is_deleted for efficient queries
CREATE INDEX IF NOT EXISTS idx_partners_is_deleted ON partners(is_deleted);
CREATE INDEX IF NOT EXISTS idx_product_mappings_is_active ON product_mappings(is_active);
