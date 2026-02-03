import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { getAllPartners, getOwnerStore, type PartnerRecord, type OwnerStoreRecord } from "~/lib/supabase.server";

interface LoaderData {
  partners: PartnerRecord[];
  ownerStore: OwnerStoreRecord | null;
  storeJustConnected: boolean;
  stats: {
    totalPartners: number;
    activePartners: number;
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const storeJustConnected = url.searchParams.get("store_connected") === "true";

  const [{ data: partners }, { data: ownerStore }] = await Promise.all([
    getAllPartners(),
    getOwnerStore(),
  ]);

  const activePartners = partners.filter(p => p.is_active && !p.is_deleted);

  return {
    partners,
    ownerStore,
    storeJustConnected,
    stats: {
      totalPartners: partners.length,
      activePartners: activePartners.length,
    },
  } satisfies LoaderData;
};

export default function AdminDashboard() {
  const { partners, ownerStore, storeJustConnected, stats } = useLoaderData<LoaderData>();

  const activePartners = partners.filter(p => p.is_active && !p.is_deleted);

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Dashboard
      </h1>

      {/* Success Message */}
      {storeJustConnected && (
        <div style={{
          backgroundColor: "#dcfce7",
          border: "1px solid #86efac",
          color: "#16a34a",
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          Parent store connected successfully.
        </div>
      )}

      {/* Parent Store Connection */}
      <div style={{
        backgroundColor: "white",
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Parent Store Connection
        </h2>
        {ownerStore ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ color: "#16a34a", fontSize: "1.25rem" }}>✓</span>
                <span style={{ fontWeight: 500 }}>{ownerStore.shop}</span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>
                Scopes: {ownerStore.scope || "N/A"}
                {ownerStore.connected_at && (
                  <span style={{ marginLeft: "1rem" }}>
                    Connected: {new Date(ownerStore.connected_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <Link
              to="/admin/connect-store"
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#f3f4f6",
                color: "#374151",
                textDecoration: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
              }}
            >
              Reconnect
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span style={{ color: "#f59e0b", fontSize: "1.25rem" }}>⚠</span>
                <span style={{ fontWeight: 500, color: "#92400e" }}>Parent store not connected</span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>
                Connect your Shopify store to enable product imports.
              </div>
            </div>
            <Link
              to="/admin/connect-store"
              style={{
                display: "inline-block",
                padding: "0.75rem 1.5rem",
                backgroundColor: "#1a1a1a",
                color: "white",
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
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
            Active Partners
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 600 }}>
            {stats.activePartners}
          </div>
        </div>

        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
            Total Partners
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 600 }}>
            {stats.totalPartners}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{
        backgroundColor: "white",
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
              backgroundColor: "#1a1a1a",
              color: "white",
              textDecoration: "none",
              borderRadius: "4px",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Browse Partners
          </Link>
        </div>
      </div>

      {/* Recent Partners */}
      <div style={{
        backgroundColor: "white",
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Active Partners
        </h2>
        {activePartners.length === 0 ? (
          <p style={{ color: "#666" }}>No active partners yet.</p>
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
                  border: "1px solid #e5e7eb",
                  borderRadius: "4px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {partner.shop.replace('.myshopify.com', '')}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#666" }}>
                    Connected {new Date(partner.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{
                  backgroundColor: "#dcfce7",
                  color: "#16a34a",
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
                style={{ color: "#2563eb", fontSize: "0.875rem", textAlign: "center" }}
              >
                View all {activePartners.length} partners
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
