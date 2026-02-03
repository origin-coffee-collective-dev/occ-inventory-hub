-- Add image_url column to partner_products for caching product images
ALTER TABLE partner_products
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add location_id column to owner_store for caching the primary location
ALTER TABLE owner_store
ADD COLUMN IF NOT EXISTS location_id TEXT;

-- Comment describing the columns
COMMENT ON COLUMN partner_products.image_url IS 'Cached URL of the partner product featured image';
COMMENT ON COLUMN owner_store.location_id IS 'Cached Shopify location ID for inventory operations';
