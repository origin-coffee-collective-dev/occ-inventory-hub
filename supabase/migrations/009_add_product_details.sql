-- Add additional product details columns for the product detail modal
-- These fields are already fetched from the partner API but not stored

ALTER TABLE partner_products
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC,
ADD COLUMN IF NOT EXISTS product_type TEXT,
ADD COLUMN IF NOT EXISTS vendor TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add a comment explaining the purpose
COMMENT ON COLUMN partner_products.description IS 'Product description HTML from partner store';
COMMENT ON COLUMN partner_products.compare_at_price IS 'Compare-at price (original price if on sale)';
COMMENT ON COLUMN partner_products.product_type IS 'Product type/category from partner store';
COMMENT ON COLUMN partner_products.vendor IS 'Product vendor/brand from partner store';
COMMENT ON COLUMN partner_products.tags IS 'Array of product tags from partner store';
COMMENT ON COLUMN partner_products.barcode IS 'Variant barcode from partner store';
