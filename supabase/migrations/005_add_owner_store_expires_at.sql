-- Add expires_at column to track token expiration
ALTER TABLE owner_store
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN owner_store.expires_at IS 'Token expiration timestamp for client credentials grant tokens';
