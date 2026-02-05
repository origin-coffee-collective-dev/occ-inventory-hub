import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { getAllPartners, type PartnerRecord, type PartnerSyncStatus } from "~/lib/supabase.server";
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

interface LoaderData {
  partners: PartnerRecord[];
}

export const loader = async ({ request: _request }: LoaderFunctionArgs) => {
  const { data: partners } = await getAllPartners();

  return { partners } satisfies LoaderData;
};

export default function AdminPartnersList() {
  const { partners } = useLoaderData<LoaderData>();

  const activePartners = partners.filter(p => p.is_active && !p.is_deleted);
  const inactivePartners = partners.filter(p => !p.is_active || p.is_deleted);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
          Partners
        </h1>
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
