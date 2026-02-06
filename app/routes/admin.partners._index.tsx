import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, Link, Form, useNavigation, useActionData } from "react-router";
import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { getAllPartners, requireAdminSession, type PartnerRecord, type PartnerSyncStatus } from "~/lib/supabase.server";
import { syncSinglePartner } from "~/lib/inventory/sync.server";
import { colors } from "~/lib/tokens";

// Helper to format relative time
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Get sync status indicator styles
function getSyncStatusStyles(status: PartnerSyncStatus | null): {
  icon: string;
  color: string;
  bg: string;
  label: string;
} {
  switch (status) {
    case "success":
      return { icon: "✓", color: colors.success.default, bg: colors.success.light, label: "OK" };
    case "warning":
      return { icon: "⚠", color: colors.warning.icon, bg: colors.warning.light, label: "Warning" };
    case "failed":
      return { icon: "✕", color: colors.error.default, bg: colors.error.light, label: "Failed" };
    default:
      return { icon: "—", color: colors.text.muted, bg: colors.background.muted, label: "No sync" };
  }
}

// Client-side domain validation (mirrors server-side validateShopDomain)
function normalizeShopDomain(input: string): string | null {
  let domain = input.trim().toLowerCase();
  if (!domain) return null;
  if (!domain.endsWith(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    return null;
  }
  return domain;
}

interface LoaderData {
  partners: PartnerRecord[];
  appUrl: string | null;
}

interface ActionData {
  success: boolean;
  intent: string;
  error?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdminSession(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "retry_sync") {
    const partnerShop = formData.get("partnerShop") as string;
    if (!partnerShop) {
      return { success: false, intent, error: "Missing partner shop" } satisfies ActionData;
    }

    try {
      const result = await syncSinglePartner(partnerShop);
      if (!result) {
        return { success: false, intent, error: "No product mappings found" } satisfies ActionData;
      }
      if (result.success) {
        return { success: true, intent } satisfies ActionData;
      }
      return { success: false, intent, error: result.errors[0] || "Sync failed" } satisfies ActionData;
    } catch (err) {
      return { success: false, intent, error: "Sync failed" } satisfies ActionData;
    }
  }

  return { success: false, intent: intent || "unknown", error: "Unknown action" } satisfies ActionData;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminSession(request);
  const { data: partners } = await getAllPartners();

  return {
    partners,
    appUrl: process.env.SHOPIFY_APP_URL || null,
  } satisfies LoaderData;
};

export default function AdminPartnersList() {
  const { partners, appUrl } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const hasShownToast = useRef(false);
  const [retryingShop, setRetryingShop] = useState<string | null>(null);
  const [inviteShop, setInviteShop] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleGenerateLink = () => {
    const domain = normalizeShopDomain(inviteShop);
    if (!domain) {
      setInviteError("Enter a valid Shopify domain (e.g. best-roastery or best-roastery.myshopify.com)");
      setInviteLink(null);
      return;
    }
    if (!appUrl) {
      setInviteError("App URL is not configured. Set SHOPIFY_APP_URL in your environment.");
      setInviteLink(null);
      return;
    }
    setInviteError(null);
    setInviteLink(`${appUrl}/partner/install?shop=${domain}`);
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const activePartners = partners.filter(p => p.is_active && !p.is_deleted);
  const inactivePartners = partners.filter(p => !p.is_active || p.is_deleted);
  const isSubmitting = navigation.state === "submitting";

  // Track which shop is being retried
  useEffect(() => {
    if (navigation.state === "submitting" && navigation.formData?.get("intent") === "retry_sync") {
      setRetryingShop(navigation.formData.get("partnerShop") as string);
    }
    if (navigation.state === "idle") {
      setRetryingShop(null);
    }
  }, [navigation.state, navigation.formData]);

  // Show toast when action completes
  useEffect(() => {
    if (actionData && !hasShownToast.current) {
      if (actionData.intent === "retry_sync") {
        if (actionData.success) {
          toast.success("Sync completed successfully");
        } else if (actionData.error) {
          toast.error(`Sync failed: ${actionData.error}`);
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

  return (
    <div>
      <Toaster position="top-right" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Partners
        </h1>
      </div>

      {/* Invite a Partner */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
          Invite a Partner
        </h2>
        <p style={{ fontSize: "0.875rem", color: colors.text.muted, marginTop: 0, marginBottom: "1rem" }}>
          Generate an install link to send to a new partner. They&apos;ll authorize the app on their Shopify store.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="text"
            value={inviteShop}
            onChange={(e) => {
              setInviteShop(e.target.value);
              setInviteLink(null);
              setInviteError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleGenerateLink();
              }
            }}
            placeholder="best-roastery or best-roastery.myshopify.com"
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              border: `1px solid ${colors.border.default}`,
              borderRadius: "4px",
              fontSize: "0.875rem",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleGenerateLink}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: colors.primary.default,
              color: colors.primary.text,
              border: "none",
              borderRadius: "4px",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Generate Link
          </button>
        </div>
        {inviteError && (
          <div style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            backgroundColor: colors.error.light,
            border: `1px solid ${colors.error.border}`,
            borderRadius: "4px",
            color: colors.error.textDark,
            fontSize: "0.875rem",
          }}>
            {inviteError}
          </div>
        )}
        {inviteLink && (
          <div style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            backgroundColor: colors.background.muted,
            border: `1px solid ${colors.border.default}`,
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            <code style={{
              flex: 1,
              fontSize: "0.8rem",
              color: colors.text.secondary,
              wordBreak: "break-all",
            }}>
              {inviteLink}
            </code>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: "0.375rem 0.75rem",
                backgroundColor: colors.success.default,
                color: colors.text.inverse,
                border: "none",
                borderRadius: "4px",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Active Partners */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Active Partners ({activePartners.length})
        </h2>
        {activePartners.length === 0 ? (
          <p style={{ color: colors.text.muted }}>No active partners yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Shop
                </th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Sync Status
                </th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Scope
                </th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Connected
                </th>
                <th style={{ textAlign: "right", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {activePartners.map(partner => {
                const syncStyles = getSyncStatusStyles(partner.last_sync_status);
                return (
                  <tr key={partner.id} style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <div style={{ fontWeight: 500 }}>
                        {partner.shop.replace('.myshopify.com', '')}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: colors.text.muted }}>
                        {partner.shop}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            backgroundColor: syncStyles.bg,
                            color: syncStyles.color,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {syncStyles.icon}
                        </span>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 500, color: syncStyles.color }}>
                            {syncStyles.label}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: colors.text.muted }}>
                            {formatRelativeTime(partner.last_sync_at)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", color: colors.text.muted }}>
                      {partner.scope || 'N/A'}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", color: colors.text.muted }}>
                      {new Date(partner.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        {/* Retry button for failed syncs */}
                        {(partner.last_sync_status === "failed" || partner.last_sync_status === "warning") && (
                          <Form method="post" style={{ display: "inline" }}>
                            <input type="hidden" name="intent" value="retry_sync" />
                            <input type="hidden" name="partnerShop" value={partner.shop} />
                            <button
                              type="submit"
                              disabled={isSubmitting && retryingShop === partner.shop}
                              title={partner.last_sync_status === "failed" ? "Retry failed sync" : "Retry sync with warnings"}
                              style={{
                                padding: "0.5rem 0.75rem",
                                backgroundColor: isSubmitting && retryingShop === partner.shop
                                  ? colors.interactive.disabled
                                  : partner.last_sync_status === "failed"
                                    ? colors.error.default
                                    : colors.warning.default,
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 500,
                                cursor: isSubmitting && retryingShop === partner.shop ? "not-allowed" : "pointer",
                              }}
                            >
                              {isSubmitting && retryingShop === partner.shop ? "Syncing..." : "Retry Sync"}
                            </button>
                          </Form>
                        )}
                        <Link
                          to={`/admin/partners/${partner.shop.replace('.myshopify.com', '')}`}
                          style={{
                            display: "inline-block",
                            padding: "0.5rem 1rem",
                            backgroundColor: colors.primary.default,
                            color: colors.text.inverse,
                            textDecoration: "none",
                            borderRadius: "4px",
                            fontSize: "0.875rem",
                          }}
                        >
                          View Products
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Inactive Partners */}
      {inactivePartners.length > 0 && (
        <div style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            Inactive Partners ({inactivePartners.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Shop
                </th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Deactivated
                </th>
              </tr>
            </thead>
            <tbody>
              {inactivePartners.map(partner => (
                <tr key={partner.id} style={{ borderBottom: `1px solid ${colors.border.default}` }}>
                  <td style={{ padding: "0.75rem 0.5rem" }}>
                    <div style={{ fontWeight: 500, color: colors.text.muted }}>
                      {partner.shop.replace('.myshopify.com', '')}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem" }}>
                    <span style={{
                      backgroundColor: partner.is_deleted ? colors.error.light : colors.warning.light,
                      color: partner.is_deleted ? colors.error.default : colors.warning.text,
                      padding: "0.25rem 0.75rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                    }}>
                      {partner.is_deleted ? "Deleted" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", color: colors.text.muted }}>
                    {partner.deleted_at
                      ? new Date(partner.deleted_at).toLocaleDateString()
                      : new Date(partner.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
