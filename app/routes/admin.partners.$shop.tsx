import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit, useActionData, Link } from "react-router";
import { useState, useEffect } from "react";
import {
  getPartnerByShop,
  getPartnerProducts,
  upsertPartnerProducts,
  getProductMappingsByShop,
  createProductMapping,
  markPartnerProductSeen,
  getOwnerStore,
  type PartnerProductRecord,
} from "~/lib/supabase.server";
import { PRODUCTS_QUERY, type ProductsQueryResult } from "~/lib/shopify/queries/products";
import { PRODUCT_SET_MUTATION, buildProductSetInput, type ProductSetResult } from "~/lib/shopify/mutations/products";
import { calculateMargin, formatPrice } from "~/lib/utils/price";
import { generatePartnerSku } from "~/lib/utils/sku";

interface LoaderData {
  partnerShop: string;
  partnerName: string;
  products: Array<PartnerProductRecord & { isImported: boolean; myPrice: number | null }>;
  lastSyncedAt: string | null;
  error?: string;
  hasOccCredentials: boolean;
}

interface ActionData {
  success: boolean;
  intent: string;
  message?: string;
  error?: string;
  newCount?: number;
  updatedCount?: number;
  importedProductId?: string;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { shop } = params;

  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  // Check for owner store connection (replaces env vars)
  const { data: ownerStore } = await getOwnerStore();
  const hasOccCredentials = !!(ownerStore?.access_token);

  // Normalize shop domain
  const partnerShop = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  const partnerName = shop.replace('.myshopify.com', '');

  // Fetch partner from database
  const { data: partner, error: partnerError } = await getPartnerByShop(partnerShop);

  if (partnerError) {
    return Response.json({
      partnerShop,
      partnerName,
      products: [],
      lastSyncedAt: null,
      error: "Database error",
      hasOccCredentials,
    } satisfies LoaderData);
  }

  if (!partner || !partner.is_active || partner.is_deleted) {
    return Response.json({
      partnerShop,
      partnerName,
      products: [],
      lastSyncedAt: null,
      error: "Partner not found or inactive",
      hasOccCredentials,
    } satisfies LoaderData);
  }

  // Fetch cached products
  const { data: cachedProducts } = await getPartnerProducts(partnerShop);

  // Fetch product mappings to determine which are already imported
  const { data: mappings } = await getProductMappingsByShop(partnerShop);
  const importedVariants = new Map(
    mappings.map(m => [m.partner_variant_id, m.my_price])
  );

  // Combine products with import status
  const products = cachedProducts.map(p => ({
    ...p,
    isImported: importedVariants.has(p.partner_variant_id),
    myPrice: importedVariants.get(p.partner_variant_id) ?? null,
  }));

  // Get last synced time
  const lastSyncedAt = products.length > 0
    ? products.reduce((latest, p) =>
        p.last_synced_at > latest ? p.last_synced_at : latest,
        products[0].last_synced_at
      )
    : null;

  return Response.json({
    partnerShop,
    partnerName,
    products,
    lastSyncedAt,
    hasOccCredentials,
  } satisfies LoaderData);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { shop } = params;

  if (!shop) {
    return Response.json({ success: false, intent: "unknown", error: "Shop parameter is required" });
  }

  const partnerShop = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Fetch partner
  const { data: partner, error: partnerError } = await getPartnerByShop(partnerShop);
  if (partnerError || !partner || !partner.access_token) {
    return Response.json({
      success: false,
      intent,
      error: "Partner not found or credentials unavailable",
    } satisfies ActionData);
  }

  // SYNC: Fetch products from partner API and update local cache
  if (intent === "sync") {
    try {
      const response = await fetch(
        `https://${partnerShop}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': partner.access_token,
          },
          body: JSON.stringify({
            query: PRODUCTS_QUERY,
            variables: { first: 250 },
          }),
        }
      );

      if (!response.ok) {
        return Response.json({
          success: false,
          intent,
          error: "Failed to fetch products from partner store",
        } satisfies ActionData);
      }

      const result = await response.json() as { data: ProductsQueryResult };

      // Transform products for caching (flatten variants)
      const productsToCache: Array<{
        partner_shop: string;
        partner_product_id: string;
        partner_variant_id: string;
        title: string;
        sku: string | null;
        price: number;
        inventory_quantity: number | null;
      }> = [];

      for (const edge of result.data.products.edges) {
        const product = edge.node;
        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node;
          productsToCache.push({
            partner_shop: partnerShop,
            partner_product_id: product.id,
            partner_variant_id: variant.id,
            title: product.variants.edges.length > 1
              ? `${product.title} - ${variant.title}`
              : product.title,
            sku: variant.sku,
            price: parseFloat(variant.price),
            inventory_quantity: variant.inventoryQuantity,
          });
        }
      }

      const { newCount, updatedCount, error: upsertError } = await upsertPartnerProducts(productsToCache);

      if (upsertError) {
        return Response.json({
          success: false,
          intent,
          error: upsertError,
        } satisfies ActionData);
      }

      return Response.json({
        success: true,
        intent,
        message: `Synced ${productsToCache.length} products (${newCount} new, ${updatedCount} updated)`,
        newCount,
        updatedCount,
      } satisfies ActionData);
    } catch (error) {
      console.error("Sync error:", error);
      return Response.json({
        success: false,
        intent,
        error: "Failed to sync products",
      } satisfies ActionData);
    }
  }

  // IMPORT: Create product on OCC's store
  if (intent === "import") {
    const partnerVariantId = formData.get("partnerVariantId") as string;
    const sellingPrice = formData.get("sellingPrice") as string;

    if (!partnerVariantId || !sellingPrice) {
      return Response.json({
        success: false,
        intent,
        error: "Missing required fields",
      } satisfies ActionData);
    }

    // Get owner store credentials from database
    const { data: ownerStore, error: ownerStoreError } = await getOwnerStore();

    if (ownerStoreError || !ownerStore?.access_token) {
      return Response.json({
        success: false,
        intent,
        error: "Parent store not connected. Please connect your store from the dashboard.",
      } satisfies ActionData);
    }

    const occStoreDomain = ownerStore.shop;
    const occStoreToken = ownerStore.access_token;

    try {
      // Get product data from cache
      const { data: cachedProducts } = await getPartnerProducts(partnerShop);
      const cachedProduct = cachedProducts.find(p => p.partner_variant_id === partnerVariantId);

      if (!cachedProduct) {
        return Response.json({
          success: false,
          intent,
          error: "Product not found in cache",
        } satisfies ActionData);
      }

      const myPrice = parseFloat(sellingPrice);
      const partnerPrice = cachedProduct.price;
      const margin = calculateMargin(partnerPrice, myPrice);

      // Generate SKU for the imported product
      const mySku = generatePartnerSku(partnerShop, cachedProduct.sku || cachedProduct.partner_variant_id);

      // Create product on OCC's store using direct GraphQL call
      const productInput = buildProductSetInput({
        title: cachedProduct.title,
        vendor: partnerShop.replace('.myshopify.com', ''),
        sku: mySku,
        price: formatPrice(myPrice),
        status: 'ACTIVE',
      });

      const response = await fetch(
        `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': occStoreToken,
          },
          body: JSON.stringify({
            query: PRODUCT_SET_MUTATION,
            variables: {
              input: productInput,
              synchronous: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Shopify API error:", errorText);
        return Response.json({
          success: false,
          intent,
          error: "Failed to create product on OCC store",
        } satisfies ActionData);
      }

      const result = await response.json() as { data: ProductSetResult };

      if (result.data.productSet.userErrors.length > 0) {
        return Response.json({
          success: false,
          intent,
          error: result.data.productSet.userErrors.map(e => e.message).join(", "),
        } satisfies ActionData);
      }

      const createdProduct = result.data.productSet.product;
      if (!createdProduct) {
        return Response.json({
          success: false,
          intent,
          error: "Product creation failed",
        } satisfies ActionData);
      }

      const createdVariant = createdProduct.variants.edges[0]?.node;
      if (!createdVariant) {
        return Response.json({
          success: false,
          intent,
          error: "Variant creation failed",
        } satisfies ActionData);
      }

      // Create product mapping
      const { error: mappingError } = await createProductMapping({
        partnerId: partner.id,
        partnerShop,
        partnerProductId: cachedProduct.partner_product_id,
        partnerVariantId: cachedProduct.partner_variant_id,
        myProductId: createdProduct.id,
        myVariantId: createdVariant.id,
        partnerSku: cachedProduct.sku,
        mySku,
        partnerPrice,
        myPrice,
        margin,
      });

      if (mappingError) {
        console.error("Failed to create product mapping:", mappingError);
      }

      // Mark product as seen (not new)
      await markPartnerProductSeen(partnerShop, partnerVariantId);

      return Response.json({
        success: true,
        intent,
        message: `Imported "${cachedProduct.title}" at $${formatPrice(myPrice)}`,
        importedProductId: createdProduct.id,
      } satisfies ActionData);
    } catch (error) {
      console.error("Import error:", error);
      return Response.json({
        success: false,
        intent,
        error: "Failed to import product",
      } satisfies ActionData);
    }
  }

  return Response.json({ success: false, intent, error: "Unknown action" } satisfies ActionData);
};

export default function AdminPartnerProducts() {
  const { partnerShop, partnerName, products, lastSyncedAt, error, hasOccCredentials } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  // Track price inputs for each product
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  // Format the last synced time
  const formatLastSynced = (isoString: string | null) => {
    if (!isoString) return "Never synced";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  const handleSync = () => {
    submit({ intent: "sync" }, { method: "post" });
  };

  const handleImport = (variantId: string) => {
    const price = priceInputs[variantId];
    if (!price || parseFloat(price) <= 0) {
      alert("Please enter a valid price");
      return;
    }
    submit(
      { intent: "import", partnerVariantId: variantId, sellingPrice: price },
      { method: "post" }
    );
  };

  const handlePriceChange = (variantId: string, value: string) => {
    setPriceInputs(prev => ({ ...prev, [variantId]: value }));
  };

  // Show feedback toast effect
  useEffect(() => {
    if (actionData?.message) {
      console.log(actionData.message);
    }
  }, [actionData]);

  const notImportedProducts = products.filter(p => !p.isImported);
  const importedProducts = products.filter(p => p.isImported);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/admin/partners" style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.875rem" }}>
          &larr; Back to Partners
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            {partnerName}
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: "0.875rem" }}>
            {partnerShop}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.875rem", color: "#666" }}>
            Last synced: {formatLastSynced(lastSyncedAt)}
          </span>
          <button
            onClick={handleSync}
            disabled={isLoading}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: isLoading ? "#9ca3af" : "#1a1a1a",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
            }}
          >
            {isLoading && navigation.formData?.get("intent") === "sync" ? "Syncing..." : "Refresh Products"}
          </button>
        </div>
      </div>

      {/* Credentials Warning */}
      {!hasOccCredentials && (
        <div style={{
          backgroundColor: "#fef3c7",
          border: "1px solid #f59e0b",
          color: "#92400e",
          padding: "1rem",
          borderRadius: "4px",
          marginBottom: "1rem",
        }}>
          <strong>Store Connection Required:</strong>{" "}
          <a href="/admin/connect-store" style={{ color: "#92400e" }}>
            Connect your parent store
          </a>{" "}
          to enable product imports.
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          padding: "1rem",
          borderRadius: "4px",
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      {/* Action Feedback */}
      {actionData && (
        <div style={{
          backgroundColor: actionData.success ? "#dcfce7" : "#fef2f2",
          border: `1px solid ${actionData.success ? "#86efac" : "#fecaca"}`,
          color: actionData.success ? "#16a34a" : "#dc2626",
          padding: "1rem",
          borderRadius: "4px",
          marginBottom: "1rem",
        }}>
          {actionData.message || actionData.error}
        </div>
      )}

      {/* Empty State */}
      {!error && products.length === 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "3rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          textAlign: "center",
        }}>
          <p style={{ color: "#666", marginBottom: "1rem" }}>No products cached yet.</p>
          <button
            onClick={handleSync}
            disabled={isLoading}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: isLoading ? "#9ca3af" : "#1a1a1a",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            Sync Products from Partner
          </button>
        </div>
      )}

      {/* Available Products (not imported) */}
      {notImportedProducts.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "1.5rem",
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            Available Products ({notImportedProducts.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {notImportedProducts.map(product => (
              <div
                key={product.id}
                style={{
                  padding: "1rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "4px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      {product.is_new && (
                        <span style={{
                          backgroundColor: "#dbeafe",
                          color: "#2563eb",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}>
                          New
                        </span>
                      )}
                      <span style={{ fontWeight: 500 }}>{product.title}</span>
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#666" }}>
                      Partner Price: ${product.price.toFixed(2)}
                      {product.sku && ` | SKU: ${product.sku}`}
                      {product.inventory_quantity !== null && ` | Stock: ${product.inventory_quantity}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div>
                      <label htmlFor={`price-${product.partner_variant_id}`} style={{ fontSize: "0.75rem", color: "#666" }}>
                        Your Price
                      </label>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span style={{ marginRight: "0.25rem" }}>$</span>
                        <input
                          id={`price-${product.partner_variant_id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={priceInputs[product.partner_variant_id] || ""}
                          onChange={(e) => handlePriceChange(product.partner_variant_id, e.target.value)}
                          placeholder="0.00"
                          style={{
                            width: "80px",
                            padding: "0.5rem",
                            border: "1px solid #d1d5db",
                            borderRadius: "4px",
                            fontSize: "0.875rem",
                          }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleImport(product.partner_variant_id)}
                      disabled={isLoading || !priceInputs[product.partner_variant_id] || !hasOccCredentials}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: (isLoading || !priceInputs[product.partner_variant_id] || !hasOccCredentials) ? "#9ca3af" : "#16a34a",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: (isLoading || !priceInputs[product.partner_variant_id] || !hasOccCredentials) ? "not-allowed" : "pointer",
                        fontSize: "0.875rem",
                        marginTop: "1.25rem",
                      }}
                    >
                      Import
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Already Imported Products */}
      {importedProducts.length > 0 && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            Imported Products ({importedProducts.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {importedProducts.map(product => (
              <div
                key={product.id}
                style={{
                  padding: "1rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>{product.title}</div>
                  <div style={{ fontSize: "0.875rem", color: "#666" }}>
                    Partner: ${product.price.toFixed(2)} &rarr; Your Store: ${product.myPrice?.toFixed(2)}
                  </div>
                </div>
                <span style={{
                  backgroundColor: "#dcfce7",
                  color: "#16a34a",
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}>
                  Imported
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
