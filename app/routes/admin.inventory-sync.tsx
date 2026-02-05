import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useNavigation, Link, Form } from "react-router";
import toast from "react-hot-toast";
import {
  getAppSettings,
  updateAppSettings,
  getActiveProductMappingsCount,
  getLatestInventorySyncLog,
  type AppSettingsRecord,
} from "~/lib/supabase.server";
import { getValidOwnerStoreToken, type TokenStatus } from "~/lib/ownerStore.server";
import { runInventorySync } from "~/lib/inventory/sync.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { colors } from "~/lib/tokens";

const INTERVAL_OPTIONS = [
  { value: 1, label: "1 minute" },
  { value: 3, label: "3 minutes" },
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 360, label: "6 hours" },
];

function formatInterval(minutes: number): string {
  const option = INTERVAL_OPTIONS.find((o) => o.value === minutes);
  if (option) return option.label;
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hours = minutes / 60;
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

interface LoaderData {
  settings: AppSettingsRecord | null;
  lastInventorySync: {
    id: string;
    status: string;
    items_processed: number;
    items_updated: number;
    items_failed: number;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
  } | null;
  importedProductsCount: number;
  ownerStoreStatus: TokenStatus;
}

interface ActionData {
  success: boolean;
  intent: string;
  error?: string;
  syncResult?: {
    totalItemsUpdated: number;
    totalItemsFailed: number;
    totalItemsSkipped: number;
  };
}

export const loader = async (_args: LoaderFunctionArgs) => {
  const [{ data: settings }, { data: lastInventorySync }, { count: importedProductsCount }, tokenResult] =
    await Promise.all([
      getAppSettings(),
      getLatestInventorySyncLog(),
      getActiveProductMappingsCount(),
      getValidOwnerStoreToken(),
    ]);

  return {
    settings,
    lastInventorySync,
    importedProductsCount,
    ownerStoreStatus: tokenResult.status,
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update_sync_settings") {
    const enabled = formData.get("enabled") === "true";
    const interval = parseInt(formData.get("interval") as string, 10);

    const updates: { inventory_sync_enabled?: boolean; inventory_sync_interval_minutes?: number } = {};

    if (formData.has("enabled")) {
      updates.inventory_sync_enabled = enabled;
    }
    if (formData.has("interval") && !isNaN(interval)) {
      updates.inventory_sync_interval_minutes = interval;
    }

    const { error } = await updateAppSettings(updates);

    if (error) {
      return { success: false, intent, error } satisfies ActionData;
    }
    return { success: true, intent } satisfies ActionData;
  }

  if (intent === "inventory_sync") {
    try {
      const result = await runInventorySync();

      if (result.success) {
        return {
          success: true,
          intent,
          syncResult: {
            totalItemsUpdated: result.totalItemsUpdated,
            totalItemsFailed: result.totalItemsFailed,
            totalItemsSkipped: result.totalItemsSkipped,
          },
        } satisfies ActionData;
      }

      return {
        success: false,
        intent,
        error: result.errors.join("; ") || "Inventory sync failed",
        syncResult: {
          totalItemsUpdated: result.totalItemsUpdated,
          totalItemsFailed: result.totalItemsFailed,
          totalItemsSkipped: result.totalItemsSkipped,
        },
      } satisfies ActionData;
    } catch (err) {
      return {
        success: false,
        intent,
        error: err instanceof Error ? err.message : "Unexpected sync error",
      } satisfies ActionData;
    }
  }

  return { success: false, intent: intent || "unknown", error: "Unknown action" } satisfies ActionData;
};

export default function InventorySyncPage() {
  const { settings, lastInventorySync, importedProductsCount, ownerStoreStatus } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const settingsFormRef = useRef<HTMLFormElement>(null);
  const syncFormRef = useRef<HTMLFormElement>(null);

  // Local form state (mirrors server state until user edits)
  const [localEnabled, setLocalEnabled] = useState(settings?.inventory_sync_enabled ?? true);
  const [localInterval, setLocalInterval] = useState(settings?.inventory_sync_interval_minutes ?? 60);

  // Modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingSettingsMessage, setPendingSettingsMessage] = useState("");

  const isSubmitting = navigation.state === "submitting";
  const submittingIntent = isSubmitting ? navigation.formData?.get("intent") : null;
  const isSyncing = submittingIntent === "inventory_sync";
  const isSavingSettings = submittingIntent === "update_sync_settings";

  const canSync = ownerStoreStatus === "connected" && importedProductsCount > 0;

  // Detect whether current local state differs from server state
  const serverEnabled = settings?.inventory_sync_enabled ?? true;
  const serverInterval = settings?.inventory_sync_interval_minutes ?? 60;
  const hasUnsavedChanges = localEnabled !== serverEnabled || localInterval !== serverInterval;

  const prevNavigationState = useRef(navigation.state);
  const hasShownToast = useRef(false);

  // Sync local state when server data changes (after a successful save)
  useEffect(() => {
    if (settings) {
      setLocalEnabled(settings.inventory_sync_enabled);
      setLocalInterval(settings.inventory_sync_interval_minutes);
    }
  }, [settings]);

  // Close modals when submission completes
  useEffect(() => {
    if (prevNavigationState.current === "submitting" && navigation.state === "idle") {
      setShowSettingsModal(false);
      setShowSyncModal(false);
    }
    prevNavigationState.current = navigation.state;
  }, [navigation.state]);

  // Show toast when actionData changes
  useEffect(() => {
    if (actionData && !hasShownToast.current) {
      if (actionData.intent === "update_sync_settings") {
        if (actionData.success) {
          toast.success("Sync settings saved");
        } else if (actionData.error) {
          toast.error(`Failed to save settings: ${actionData.error}`);
        }
      } else if (actionData.intent === "inventory_sync") {
        if (actionData.success) {
          const updated = actionData.syncResult?.totalItemsUpdated ?? 0;
          toast.success(`Inventory sync complete: ${updated} item${updated !== 1 ? "s" : ""} updated`);
        } else if (actionData.error) {
          toast.error(`Inventory sync failed: ${actionData.error}`);
        }
      }
      hasShownToast.current = true;
    }
  }, [actionData]);

  // Reset toast flag when starting a new submission
  useEffect(() => {
    if (navigation.state === "submitting") {
      hasShownToast.current = false;
    }
  }, [navigation.state]);

  // Build the confirmation message for settings changes
  function buildSettingsConfirmMessage(): string {
    const enabledChanged = localEnabled !== serverEnabled;
    const intervalChanged = localInterval !== serverInterval;

    if (enabledChanged && !localEnabled) {
      return "Inventory will no longer sync automatically. You can still sync manually.";
    }
    if (enabledChanged && localEnabled && intervalChanged) {
      return `Inventory will sync automatically every ${formatInterval(localInterval)}.`;
    }
    if (enabledChanged && localEnabled) {
      return `Inventory will sync automatically every ${formatInterval(localInterval)}.`;
    }
    if (intervalChanged) {
      return `Inventory will now sync every ${formatInterval(localInterval)} instead of every ${formatInterval(serverInterval)}.`;
    }
    return "Save these sync settings?";
  }

  function getSettingsConfirmTitle(): string {
    const enabledChanged = localEnabled !== serverEnabled;
    if (enabledChanged && !localEnabled) return "Disable Automatic Sync?";
    if (enabledChanged && localEnabled) return "Enable Automatic Sync?";
    return "Change Sync Interval?";
  }

  function handleSaveClick() {
    if (!hasUnsavedChanges) return;
    setPendingSettingsMessage(buildSettingsConfirmMessage());
    setShowSettingsModal(true);
  }

  function confirmSaveSettings() {
    settingsFormRef.current?.submit();
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Inventory Sync</h1>
        <Link
          to="/admin"
          style={{
            color: colors.interactive.link,
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          &larr; Dashboard
        </Link>
      </div>

      {/* Sync Schedule Card */}
      <div
        style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1.25rem" }}>Sync Schedule</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Automatic Sync Toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: "0.125rem" }}>Automatic Sync</div>
              <div style={{ fontSize: "0.8125rem", color: colors.text.muted }}>
                Automatically sync inventory from partner stores on a schedule
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLocalEnabled(!localEnabled)}
              aria-label={localEnabled ? "Disable automatic sync" : "Enable automatic sync"}
              style={{
                width: "44px",
                height: "24px",
                borderRadius: "12px",
                border: "none",
                backgroundColor: localEnabled ? colors.success.default : colors.border.strong,
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.2s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: localEnabled ? "22px" : "2px",
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  backgroundColor: colors.background.card,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </button>
          </div>

          {/* Sync Interval Dropdown */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: "0.125rem" }}>Sync Interval</div>
              <div style={{ fontSize: "0.8125rem", color: colors.text.muted }}>
                How often to sync when automatic sync is enabled
              </div>
            </div>
            <select
              value={localInterval}
              onChange={(e) => setLocalInterval(Number(e.target.value))}
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "4px",
                border: `1px solid ${colors.border.default}`,
                backgroundColor: colors.background.card,
                fontSize: "0.875rem",
                cursor: "pointer",
                minWidth: "140px",
              }}
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Save Button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!hasUnsavedChanges || isSavingSettings}
              style={{
                padding: "0.5rem 1.25rem",
                backgroundColor: hasUnsavedChanges && !isSavingSettings ? colors.primary.default : colors.interactive.disabled,
                color: colors.text.inverse,
                border: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: hasUnsavedChanges && !isSavingSettings ? "pointer" : "not-allowed",
              }}
            >
              {isSavingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>

      {/* Last Sync Card */}
      <div
        style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Last Sync</h2>
          <button
            type="button"
            onClick={() => setShowSyncModal(true)}
            disabled={!canSync || isSyncing}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: canSync && !isSyncing ? colors.primary.default : colors.interactive.disabled,
              color: colors.text.inverse,
              border: "none",
              borderRadius: "4px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: canSync && !isSyncing ? "pointer" : "not-allowed",
            }}
          >
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        {importedProductsCount === 0 ? (
          <p style={{ color: colors.text.muted, margin: 0 }}>
            No products imported yet. Import products from a partner to enable inventory sync.
          </p>
        ) : lastInventorySync ? (
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: colors.background.subtle,
              borderRadius: "4px",
              fontSize: "0.875rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span
                style={{
                  color:
                    lastInventorySync.status === "completed"
                      ? colors.success.default
                      : lastInventorySync.status === "failed"
                        ? colors.error.default
                        : colors.warning.icon,
                  fontWeight: 500,
                }}
              >
                {lastInventorySync.status === "completed" ? "✓" : lastInventorySync.status === "failed" ? "✕" : "○"}
              </span>
              <span style={{ fontWeight: 500 }}>Status: {lastInventorySync.status}</span>
            </div>
            <div style={{ color: colors.text.muted, marginBottom: "0.25rem" }}>
              Time: {new Date(lastInventorySync.started_at).toLocaleString()}
            </div>
            <div style={{ color: colors.text.muted }}>
              Items: {lastInventorySync.items_updated} updated, {lastInventorySync.items_failed} failed
              {lastInventorySync.error_message && (
                <span style={{ color: colors.error.text }}> — {lastInventorySync.error_message}</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
            {importedProductsCount} imported product{importedProductsCount !== 1 ? "s" : ""} tracked. No sync history
            yet.
          </div>
        )}
      </div>

      {/* Hidden form for settings update */}
      <Form method="post" ref={settingsFormRef} style={{ display: "none" }}>
        <input type="hidden" name="intent" value="update_sync_settings" />
        <input type="hidden" name="enabled" value={String(localEnabled)} />
        <input type="hidden" name="interval" value={String(localInterval)} />
      </Form>

      {/* Hidden form for inventory sync */}
      <Form method="post" ref={syncFormRef} style={{ display: "none" }}>
        <input type="hidden" name="intent" value="inventory_sync" />
      </Form>

      {/* Settings Change Confirmation Modal */}
      <ConfirmModal
        isOpen={showSettingsModal}
        title={getSettingsConfirmTitle()}
        message={pendingSettingsMessage}
        confirmLabel="Save Settings"
        cancelLabel="Cancel"
        onConfirm={confirmSaveSettings}
        onCancel={() => setShowSettingsModal(false)}
        isLoading={isSavingSettings}
      />

      {/* Inventory Sync Confirmation Modal */}
      <ConfirmModal
        isOpen={showSyncModal}
        title="Sync Inventory Now?"
        message={`This will fetch the latest inventory quantities from all partner stores and update ${importedProductsCount} imported product${importedProductsCount !== 1 ? "s" : ""} on your store.`}
        confirmLabel="Sync Now"
        cancelLabel="Cancel"
        onConfirm={() => syncFormRef.current?.submit()}
        onCancel={() => setShowSyncModal(false)}
        isLoading={isSyncing}
      />
    </div>
  );
}
