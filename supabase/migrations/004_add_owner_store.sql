-- Owner store table for the parent OCC store
-- Stores OAuth credentials obtained through the OAuth flow
CREATE TABLE IF NOT EXISTS owner_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT UNIQUE NOT NULL,
  access_token TEXT,
  scope TEXT,
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only one owner store can be connected at a time
-- This enforces a singleton pattern for the connected store
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_store_singleton
  ON owner_store ((true)) WHERE is_connected = true;

-- Index for quick lookup by shop
CREATE INDEX IF NOT EXISTS idx_owner_store_shop ON owner_store(shop);
