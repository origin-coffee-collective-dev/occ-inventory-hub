-- App-level settings (singleton row)
-- Used for runtime control of cron-based inventory sync scheduling
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_sync_enabled BOOLEAN NOT NULL DEFAULT true,
  inventory_sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton row with defaults
INSERT INTO app_settings (inventory_sync_enabled, inventory_sync_interval_minutes)
VALUES (true, 60);
