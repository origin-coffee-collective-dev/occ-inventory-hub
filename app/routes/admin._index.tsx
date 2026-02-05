import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useNavigation, Link, Form } from "react-router";
import toast from "react-hot-toast";
import { getAllPartners, getActiveProductMappingsCount, getLatestInventorySyncLog, type PartnerRecord } from "~/lib/supabase.server";
import { getValidOwnerStoreToken, refreshOwnerStoreToken, type TokenStatus } from "~/lib/ownerStore.server";
import { runInventorySync } from "~/lib/inventory/sync.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { colors } from "~/lib/tokens";

interface LoaderData {
  partners: PartnerRecord[];
  ownerStoreStatus: TokenStatus;
  ownerStoreDomain: string | null;
  ownerStoreError: string | null;
  tokenExpiresAt: string | null;
  storeJustConnected: boolean;
  importedProductsCount: number;
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
  stats: {
    totalPartners: number;
    activePartners: number;
  };
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "refresh_token") {
    const tokenResult = await refreshOwnerStoreToken();

    if (tokenResult.status === "connected") {
      return { success: true, intent } satisfies ActionData;
    }

    return {
      success: false,
      intent,
      error: tokenResult.error || "Failed to refresh token",
    } satisfies ActionData;
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const storeJustConnected = url.searchParams.get("store_connected") === "true";

  // Fetch all data in parallel
  const [{ data: partners }, tokenResult, { count: importedProductsCount }, { data: lastInventorySync }] = await Promise.all([
    getAllPartners(),
    getValidOwnerStoreToken(),
    getActiveProductMappingsCount(),
    getLatestInventorySyncLog(),
  ]);

  const activePartners = partners.filter(p => p.is_active && !p.is_deleted);

  return {
    partners,
    ownerStoreStatus: tokenResult.status,
    ownerStoreDomain: tokenResult.shop,
    ownerStoreError: tokenResult.error,
    tokenExpiresAt: tokenResult.expiresAt,
    storeJustConnected,
    importedProductsCount,
    lastInventorySync,
    stats: {
      totalPartners: partners.length,
      activePartners: activePartners.length,
    },
  } satisfies LoaderData;
};

export default function AdminDashboard() {
  const { partners, ownerStoreStatus, ownerStoreDomain, ownerStoreError, tokenExpiresAt, storeJustConnected, importedProductsCount, lastInventorySync, stats } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const syncFormRef = useRef<HTMLFormElement>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const isSubmitting = navigation.state === "submitting";
  const submittingIntent = isSubmitting ? navigation.formData?.get("intent") : null;
  const isSyncing = submittingIntent === "inventory_sync";
  const isRefreshing = submittingIntent === "refresh_token";
  const activePartners = partners.filter(p => p.is_active && !p.is_deleted);
  const prevNavigationState = useRef(navigation.state);
  const hasShownToast = useRef(false);

  const canSync = ownerStoreStatus === "connected" && importedProductsCount > 0;

  // Close modals when submission completes
  useEffect(() => {
    if (prevNavigationState.current === "submitting" && navigation.state === "idle") {
      setShowRefreshModal(false);
      setShowSyncModal(false);
    }
    prevNavigationState.current = navigation.state;
  }, [navigation.state]);

  // Show toast when actionData changes
  useEffect(() => {
    if (actionData && !hasShownToast.current) {
      if (actionData.intent === "refresh_token") {
        if (actionData.success) {
          toast.success("Token refreshed successfully");
        } else if (actionData.error) {
          toast.error(`Failed to refresh token: ${actionData.error}`);
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

  // Format token expiry time
  const formatExpiresAt = (isoString: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    return `${diffMins}m`;
  };

  // Get status indicator styles
  const getStatusStyles = () => {
    switch (ownerStoreStatus) {
      case 'connected':
        return { bg: colors.success.light, border: colors.success.border, color: colors.success.default, icon: "✓" };
      case 'expired':
        return { bg: colors.warning.light, border: colors.warning.border, color: colors.warning.icon, icon: "○" };
      case 'error':
        return { bg: colors.error.light, border: colors.error.border, color: colors.error.default, icon: "✕" };
      case 'not_configured':
      default:
        return { bg: colors.background.muted, border: colors.border.strong, color: colors.text.light, icon: "○" };
    }
  };

  const statusStyles = getStatusStyles();

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Dashboard
      </h1>

      {/* Success Message */}
      {storeJustConnected && (
        <div style={{
          backgroundColor: colors.success.light,
          border: `1px solid ${colors.success.border}`,
          color: colors.success.default,
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          Parent store connected successfully.
        </div>
      )}

      {/* Parent Store Connection */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Parent Store Connection
        </h2>
        {ownerStoreStatus === 'connected' ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ color: statusStyles.color, fontSize: "1.25rem" }}>{statusStyles.icon}</span>
                <span style={{ fontWeight: 500 }}>{ownerStoreDomain}</span>
                <span style={{
                  backgroundColor: statusStyles.bg,
                  color: statusStyles.color,
                  padding: "0.125rem 0.5rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}>
                  Connected
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                Token expires in: {formatExpiresAt(tokenExpiresAt) || "N/A"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRefreshModal(true)}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: colors.background.muted,
                color: colors.text.secondary,
                border: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Refresh Token
            </button>
          </div>
        ) : ownerStoreStatus === 'error' ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ color: statusStyles.color, fontSize: "1.25rem" }}>{statusStyles.icon}</span>
                <span style={{ fontWeight: 500, color: statusStyles.color }}>Connection Error</span>
              </div>
              <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                {ownerStoreError || "Failed to connect to store"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRefreshModal(true)}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: colors.primary.default,
                color: colors.text.inverse,
                border: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Refresh Token
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ color: colors.warning.default, fontSize: "1.25rem" }}>⚠</span>
                <span style={{ fontWeight: 500, color: colors.warning.text }}>
                  {ownerStoreStatus === 'not_configured' ? 'Store not configured' : 'Parent store not connected'}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                {ownerStoreStatus === 'not_configured'
                  ? 'OCC_STORE_DOMAIN environment variable is not set.'
                  : 'Connect your Shopify store to enable product imports.'}
              </div>
            </div>
            <Link
              to="/admin/connect-store"
              style={{
                display: "inline-block",
                padding: "0.75rem 1.5rem",
                backgroundColor: colors.primary.default,
                color: colors.text.inverse,
                textDecoration: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Connect Store
            </Link>
          </div>
        )}

      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontSize: "0.875rem", color: colors.text.muted, marginBottom: "0.5rem" }}>
            Active Partners
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 600 }}>
            {stats.activePartners}
          </div>
        </div>

        <div style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontSize: "0.875rem", color: colors.text.muted, marginBottom: "0.5rem" }}>
            Total Partners
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 600 }}>
            {stats.totalPartners}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "2rem",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Quick Actions
        </h2>
        <div style={{ display: "flex", gap: "1rem" }}>
          <Link
            to="/admin/partners"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              backgroundColor: colors.primary.default,
              color: colors.text.inverse,
              textDecoration: "none",
              borderRadius: "4px",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Browse Partners
          </Link>
          <Link
            to="/admin/my-store"
            style={{
              display: "inline-block",
              padding: "0.75rem 1.5rem",
              backgroundColor: colors.background.muted,
              color: colors.text.secondary,
              textDecoration: "none",
              borderRadius: "4px",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            View My Store Products
          </Link>
        </div>
      </div>

      {/* Inventory Sync */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "2rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Inventory Sync
          </h2>
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
        ) : (
          <div>
            <div style={{ fontSize: "0.875rem", color: colors.text.muted, marginBottom: "0.5rem" }}>
              {importedProductsCount} imported product{importedProductsCount !== 1 ? "s" : ""} tracked
            </div>
            {lastInventorySync ? (
              <div style={{
                padding: "0.75rem",
                backgroundColor: colors.background.subtle,
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{
                    color: lastInventorySync.status === "completed" ? colors.success.default : lastInventorySync.status === "failed" ? colors.error.default : colors.warning.icon,
                    fontWeight: 500,
                  }}>
                    {lastInventorySync.status === "completed" ? "✓" : lastInventorySync.status === "failed" ? "✕" : "○"}
                  </span>
                  <span style={{ fontWeight: 500 }}>
                    Last sync: {lastInventorySync.status}
                  </span>
                  <span style={{ color: colors.text.muted }}>
                    {new Date(lastInventorySync.started_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: colors.text.muted }}>
                  {lastInventorySync.items_updated} updated, {lastInventorySync.items_failed} failed
                  {lastInventorySync.error_message && (
                    <span style={{ color: colors.error.text }}> — {lastInventorySync.error_message}</span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
                No sync history yet. Click &ldquo;Sync Now&rdquo; to run the first inventory sync.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Partners */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Active Partners
        </h2>
        {activePartners.length === 0 ? (
          <p style={{ color: colors.text.muted }}>No active partners yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {activePartners.slice(0, 5).map(partner => (
              <Link
                key={partner.id}
                to={`/admin/partners/${partner.shop.replace('.myshopify.com', '')}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 1rem",
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: "4px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {partner.shop.replace('.myshopify.com', '')}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: colors.text.muted }}>
                    Connected {new Date(partner.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{
                  backgroundColor: colors.success.light,
                  color: colors.success.default,
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}>
                  Active
                </div>
              </Link>
            ))}
            {activePartners.length > 5 && (
              <Link
                to="/admin/partners"
                style={{ color: colors.interactive.link, fontSize: "0.875rem", textAlign: "center" }}
              >
                View all {activePartners.length} partners
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Hidden form for token refresh */}
      <Form method="post" ref={formRef} style={{ display: "none" }}>
        <input type="hidden" name="intent" value="refresh_token" />
      </Form>

      {/* Hidden form for inventory sync */}
      <Form method="post" ref={syncFormRef} style={{ display: "none" }}>
        <input type="hidden" name="intent" value="inventory_sync" />
      </Form>

      {/* Token Refresh Confirmation Modal */}
      <ConfirmModal
        isOpen={showRefreshModal}
        title="Refresh Access Token?"
        message="This will request a new access token from Shopify. The current token will be replaced and the expiration timer will reset."
        confirmLabel="Refresh Token"
        cancelLabel="Cancel"
        onConfirm={() => formRef.current?.submit()}
        onCancel={() => setShowRefreshModal(false)}
        isLoading={isRefreshing}
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
