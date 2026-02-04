import { useLoaderData, Link } from "react-router";
import { getValidOwnerStoreToken } from "~/lib/ownerStore.server";
import { PRODUCTS_QUERY, type ProductsQueryResult } from "~/lib/shopify/queries/products";
import { colors } from "~/lib/tokens";

interface LoaderData {
  products: Array<{
    id: string;
    title: string;
    status: string;
    variants: Array<{
      id: string;
      title: string;
      sku: string | null;
      price: string;
      inventoryQuantity: number | null;
    }>;
  }>;
  error: string | null;
  shop: string | null;
  productCount: number;
}

export const loader = async () => {
  const tokenResult = await getValidOwnerStoreToken();

  if (tokenResult.status !== 'connected' || !tokenResult.accessToken) {
    return {
      products: [],
      error: tokenResult.error || 'Store not connected',
      shop: tokenResult.shop,
      productCount: 0,
    } satisfies LoaderData;
  }

  try {
    const response = await fetch(
      `https://${tokenResult.shop}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': tokenResult.accessToken,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: { first: 50 },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        products: [],
        error: `API Error: ${response.status} - ${errorText}`,
        shop: tokenResult.shop,
        productCount: 0,
      } satisfies LoaderData;
    }

    const json = await response.json() as { data?: ProductsQueryResult; errors?: Array<{ message: string }> };

    if (json.errors?.length) {
      return {
        products: [],
        error: json.errors.map(e => e.message).join(', '),
        shop: tokenResult.shop,
        productCount: 0,
      } satisfies LoaderData;
    }

    const products = json.data?.products.edges.map(edge => ({
      id: edge.node.id,
      title: edge.node.title,
      status: edge.node.status,
      variants: edge.node.variants.edges.map(v => ({
        id: v.node.id,
        title: v.node.title,
        sku: v.node.sku,
        price: v.node.price,
        inventoryQuantity: v.node.inventoryQuantity,
      })),
    })) || [];

    return {
      products,
      error: null,
      shop: tokenResult.shop,
      productCount: products.length,
    } satisfies LoaderData;
  } catch (err) {
    return {
      products: [],
      error: err instanceof Error ? err.message : 'Failed to fetch products',
      shop: tokenResult.shop,
      productCount: 0,
    } satisfies LoaderData;
  }
};

export default function MyStore() {
  const { products, error, shop, productCount } = useLoaderData<LoaderData>();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          My Store Products
        </h1>
        <Link
          to="/admin"
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: colors.background.muted,
            color: colors.text.secondary,
            textDecoration: "none",
            borderRadius: "4px",
            fontSize: "0.875rem",
          }}
        >
          Back to Dashboard
        </Link>
      </div>

      {/* Store Info */}
      <div style={{
        backgroundColor: colors.background.card,
        padding: "1rem 1.5rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "1.5rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <span style={{ fontWeight: 500 }}>{shop || 'Not connected'}</span>
        </div>
        <div style={{ fontSize: "0.875rem", color: colors.text.muted }}>
          {productCount} products
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div style={{
          backgroundColor: colors.error.light,
          border: `1px solid ${colors.error.border}`,
          color: colors.error.default,
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          {error}
        </div>
      )}

      {/* Products Table */}
      {products.length > 0 ? (
        <div style={{
          backgroundColor: colors.background.card,
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.875rem",
          }}>
            <thead>
              <tr style={{ backgroundColor: colors.background.hover, borderBottom: `1px solid ${colors.border.default}` }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontWeight: 600 }}>Title</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontWeight: 600 }}>SKU</th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontWeight: 600 }}>Price</th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem", fontWeight: 600 }}>Inventory</th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                product.variants.map((variant, variantIndex) => (
                  <tr
                    key={variant.id}
                    style={{ borderBottom: `1px solid ${colors.border.default}` }}
                  >
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {variantIndex === 0 ? product.title : ''}
                      {product.variants.length > 1 && (
                        <span style={{ color: colors.text.muted, marginLeft: variantIndex === 0 ? "0.5rem" : "0" }}>
                          {variant.title !== 'Default Title' ? variant.title : ''}
                        </span>
                      )}
                      {variantIndex !== 0 && variant.title !== 'Default Title' && (
                        <span style={{ color: colors.text.muted, paddingLeft: "1rem" }}>
                          └ {variant.title}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: colors.text.muted, fontFamily: "monospace" }}>
                      {variant.sku || '—'}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      ${parseFloat(variant.price).toFixed(2)}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      {variant.inventoryQuantity !== null ? variant.inventoryQuantity : '—'}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                      {variantIndex === 0 && (
                        <span style={{
                          display: "inline-block",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          backgroundColor: product.status === 'ACTIVE' ? colors.success.light : colors.background.muted,
                          color: product.status === 'ACTIVE' ? colors.success.default : colors.text.light,
                        }}>
                          {product.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      ) : !error && (
        <div style={{
          backgroundColor: colors.background.card,
          padding: "3rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          textAlign: "center",
          color: colors.text.muted,
        }}>
          No products found in the store.
        </div>
      )}
    </div>
  );
}
