import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { getAllPartners, type PartnerRecord } from "~/lib/supabase.server";

interface LoaderData {
  partners: PartnerRecord[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
        backgroundColor: "white",
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "1.5rem",
      }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          Active Partners ({activePartners.length})
        </h2>
        {activePartners.length === 0 ? (
          <p style={{ color: "#666" }}>No active partners yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Shop
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
              {activePartners.map(partner => (
                <tr key={partner.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "0.75rem 0.5rem" }}>
                    <div style={{ fontWeight: 500 }}>
                      {partner.shop.replace('.myshopify.com', '')}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#666" }}>
                      {partner.shop}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", color: "#666" }}>
                    {partner.scope || 'N/A'}
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", color: "#666" }}>
                    {new Date(partner.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                    <Link
                      to={`/admin/partners/${partner.shop.replace('.myshopify.com', '')}`}
                      style={{
                        display: "inline-block",
                        padding: "0.5rem 1rem",
                        backgroundColor: "#1a1a1a",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: "4px",
                        fontSize: "0.875rem",
                      }}
                    >
                      View Products
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inactive Partners */}
      {inactivePartners.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            Inactive Partners ({inactivePartners.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
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
                <tr key={partner.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "0.75rem 0.5rem" }}>
                    <div style={{ fontWeight: 500, color: "#666" }}>
                      {partner.shop.replace('.myshopify.com', '')}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem" }}>
                    <span style={{
                      backgroundColor: partner.is_deleted ? "#fef2f2" : "#fefce8",
                      color: partner.is_deleted ? "#dc2626" : "#ca8a04",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 500,
                    }}>
                      {partner.is_deleted ? "Deleted" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", color: "#666" }}>
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
