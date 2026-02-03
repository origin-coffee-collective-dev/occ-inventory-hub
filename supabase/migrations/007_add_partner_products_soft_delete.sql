-- Add soft delete columns to partner_products
ALTER TABLE partner_products
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for filtering out deleted products
CREATE INDEX IF NOT EXISTS idx_partner_products_is_deleted ON partner_products(is_deleted);

COMMENT ON COLUMN partner_products.is_deleted IS 'True if product no longer exists in partner store';
COMMENT ON COLUMN partner_products.deleted_at IS 'Timestamp when product was marked as deleted';
