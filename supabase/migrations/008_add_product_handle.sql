-- Add handle column to partner_products for linking to partner store
ALTER TABLE partner_products
ADD COLUMN IF NOT EXISTS handle TEXT;

-- Comment describing the column
COMMENT ON COLUMN partner_products.handle IS 'Product handle for constructing storefront URLs';
