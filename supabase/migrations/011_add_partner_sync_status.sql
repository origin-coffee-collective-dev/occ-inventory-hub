-- Add sync status tracking fields to partners table
-- These track the health of each partner's inventory sync

ALTER TABLE partners
ADD COLUMN last_sync_status TEXT CHECK (last_sync_status IN ('success', 'warning', 'failed')),
ADD COLUMN last_sync_at TIMESTAMPTZ,
ADD COLUMN consecutive_sync_failures INTEGER NOT NULL DEFAULT 0;

-- Add comment explaining the fields
COMMENT ON COLUMN partners.last_sync_status IS 'Status of the last inventory sync: success, warning, or failed';
COMMENT ON COLUMN partners.last_sync_at IS 'Timestamp of the last inventory sync attempt';
COMMENT ON COLUMN partners.consecutive_sync_failures IS 'Number of consecutive sync failures for alert triggering';
