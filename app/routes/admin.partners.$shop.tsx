import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit, useActionData, Link } from "react-router";
import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  getPartnerByShop,
  getPartnerProducts,
  upsertPartnerProducts,
  getProductMappingsByShop,
  createProductMapping,
  markPartnerProductSeen,
  unlinkProductMapping,
  type PartnerProductRecord,
} from "~/lib/supabase.server";
import { ProductDetailModal } from "~/components/ProductDetailModal";
import { getValidOwnerStoreToken } from "~/lib/ownerStore.server";
import { PRODUCTS_QUERY, type ProductsQueryResult } from "~/lib/shopify/queries/products";
import { PRODUCT_SET_MUTATION, buildProductSetInput, type ProductSetResult } from "~/lib/shopify/mutations/products";
import {
  INVENTORY_ITEM_UPDATE,
  INVENTORY_SET_QUANTITIES,
  type InventoryItemUpdateResult,
  type InventorySetQuantitiesResult,
} from "~/lib/shopify/mutations/inventory";
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

  // Check for owner store connection (auto-refreshes token if needed)
  const tokenResult = await getValidOwnerStoreToken();
  const hasOccCredentials = tokenResult.status === 'connected';

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
        image_url: string | null;
        handle: string | null;
        description: string | null;
        compare_at_price: number | null;
        product_type: string | null;
        vendor: string | null;
        tags: string[] | null;
        barcode: string | null;
      }> = [];

      for (const edge of result.data.products.edges) {
        const product = edge.node;
        // Get the product's featured image URL
        const productImageUrl = product.featuredImage?.url || null;

        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node;
          // Use variant-specific image if available, otherwise fall back to product image
          const imageUrl = variant.image?.url || productImageUrl;

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
            image_url: imageUrl,
            handle: product.handle,
            description: product.descriptionHtml || null,
            compare_at_price: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
            product_type: product.productType || null,
            vendor: product.vendor || null,
            tags: product.tags && product.tags.length > 0 ? product.tags : null,
            barcode: variant.barcode || null,
          });
        }
      }

      const { newCount, updatedCount, deletedCount, restoredCount, error: upsertError } = await upsertPartnerProducts(productsToCache);

      if (upsertError) {
        return Response.json({
          success: false,
          intent,
          error: upsertError,
        } satisfies ActionData);
      }

      // Build a descriptive message
      const parts = [];
      if (newCount > 0) parts.push(`${newCount} new`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (deletedCount > 0) parts.push(`${deletedCount} removed`);
      if (restoredCount > 0) parts.push(`${restoredCount} restored`);
      const details = parts.length > 0 ? ` (${parts.join(', ')})` : '';

      return Response.json({
        success: true,
        intent,
        message: `Synced ${productsToCache.length} products${details}`,
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

    // Get owner store credentials (auto-refreshes token if needed)
    const tokenResult = await getValidOwnerStoreToken();

    if (tokenResult.status !== 'connected' || !tokenResult.accessToken) {
      return Response.json({
        success: false,
        intent,
        error: tokenResult.error || "Parent store not connected. Please connect your store from the dashboard.",
      } satisfies ActionData);
    }

    const occStoreDomain = tokenResult.shop!;
    const occStoreToken = tokenResult.accessToken;

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
        imageUrl: cachedProduct.image_url || undefined,
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

      const result = await response.json() as {
        data: ProductSetResult | null;
        errors?: Array<{ message: string }>;
      };

      // Check for GraphQL-level errors first
      if (result.errors && result.errors.length > 0) {
        console.error("GraphQL errors:", result.errors);
        return Response.json({
          success: false,
          intent,
          error: result.errors.map(e => e.message).join(", "),
        } satisfies ActionData);
      }

      // Check if data exists
      if (!result.data || !result.data.productSet) {
        return Response.json({
          success: false,
          intent,
          error: "Unexpected response from Shopify API",
        } satisfies ActionData);
      }

      // Now safe to check userErrors
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

      // Setup inventory tracking
      const inventoryItemId = createdVariant.inventoryItem?.id;
      const locationId = tokenResult.locationId;
      const partnerInventoryQty = cachedProduct.inventory_quantity ?? 0;

      if (inventoryItemId && locationId) {
        // Step 1: Enable inventory tracking
        const trackingResponse = await fetch(
          `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': occStoreToken,
            },
            body: JSON.stringify({
              query: INVENTORY_ITEM_UPDATE,
              variables: {
                id: inventoryItemId,
                input: { tracked: true },
              },
            }),
          }
        );

        if (trackingResponse.ok) {
          const trackingResult = await trackingResponse.json() as {
            data: InventoryItemUpdateResult | null;
            errors?: Array<{ message: string }>;
          };

          // Check for GraphQL-level errors
          if (trackingResult.errors && trackingResult.errors.length > 0) {
            console.error("Inventory tracking GraphQL errors:", trackingResult.errors);
          } else {
            const trackingUserErrors = trackingResult.data?.inventoryItemUpdate?.userErrors;
            if (trackingUserErrors && trackingUserErrors.length > 0) {
              console.error("Inventory tracking error:", trackingUserErrors);
            }
          }

          // Step 2: Set initial inventory quantity
          const quantityResponse = await fetch(
            `https://${occStoreDomain}/admin/api/2025-01/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': occStoreToken,
              },
              body: JSON.stringify({
                query: INVENTORY_SET_QUANTITIES,
                variables: {
                  input: {
                    name: "available",
                    reason: "correction",
                    quantities: [
                      {
                        inventoryItemId,
                        locationId,
                        quantity: partnerInventoryQty,
                      },
                    ],
                  },
                },
              }),
            }
          );

          if (quantityResponse.ok) {
            const quantityResult = await quantityResponse.json() as {
              data: InventorySetQuantitiesResult | null;
              errors?: Array<{ message: string }>;
            };

            // Check for GraphQL-level errors
            if (quantityResult.errors && quantityResult.errors.length > 0) {
              console.error("Inventory quantity GraphQL errors:", quantityResult.errors);
            } else {
              const quantityUserErrors = quantityResult.data?.inventorySetQuantities?.userErrors;
              if (quantityUserErrors && quantityUserErrors.length > 0) {
                console.error("Inventory quantity error:", quantityUserErrors);
              }
            }
          } else {
            console.error("Failed to set inventory quantity:", await quantityResponse.text());
          }
        } else {
          console.error("Failed to enable inventory tracking:", await trackingResponse.text());
        }
      } else {
        console.warn("Skipping inventory setup: missing inventoryItemId or locationId");
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

  // UNLINK: Remove the product mapping (mark as no longer imported)
  if (intent === "unlink") {
    const partnerVariantId = formData.get("partnerVariantId") as string;

    if (!partnerVariantId) {
      return Response.json({
        success: false,
        intent,
        error: "Missing variant ID",
      } satisfies ActionData);
    }

    const { error: unlinkError } = await unlinkProductMapping(partnerShop, partnerVariantId);

    if (unlinkError) {
      return Response.json({
        success: false,
        intent,
        error: unlinkError,
      } satisfies ActionData);
    }

    return Response.json({
      success: true,
      intent,
      message: "Product unlinked successfully",
    } satisfies ActionData);
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

  // Track which product is being removed (for confirmation modal)
  const [removeProduct, setRemoveProduct] = useState<{ variantId: string; title: string } | null>(null);

  // Track which product is selected for the detail modal
  const [selectedProduct, setSelectedProduct] = useState<(PartnerProductRecord & { isImported: boolean; myPrice: number | null }) | null>(null);

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

  const handleRemoveClick = (variantId: string, title: string) => {
    setRemoveProduct({ variantId, title });
  };

  const handleRemoveConfirm = () => {
    if (removeProduct) {
      submit({ intent: "unlink", partnerVariantId: removeProduct.variantId }, { method: "post" });
      setRemoveProduct(null);
    }
  };

  const handleRemoveCancel = () => {
    setRemoveProduct(null);
  };

  const handleProductClick = (product: PartnerProductRecord & { isImported: boolean; myPrice: number | null }) => {
    setSelectedProduct(product);
  };

  const handleModalClose = () => {
    setSelectedProduct(null);
  };

  const handleModalImport = (variantId: string, price: string) => {
    submit(
      { intent: "import", partnerVariantId: variantId, sellingPrice: price },
      { method: "post" }
    );
    setSelectedProduct(null);
  };

  // Show toast when action completes
  useEffect(() => {
    if (actionData?.success && actionData?.message) {
      toast.success(actionData.message);
    } else if (!actionData?.success && actionData?.error) {
      toast.error(actionData.error);
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

      {/* Toast notifications */}
      <Toaster position="top-right" />

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
                onClick={() => handleProductClick(product)}
                style={{
                  padding: "1rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "4px",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                  {/* Product Image */}
                  <div style={{
                    width: "64px",
                    height: "64px",
                    flexShrink: 0,
                    backgroundColor: "#f3f4f6",
                    borderRadius: "4px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    )}
                  </div>
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
                      {product.handle && (
                        <a
                          href={`https://${product.partner_shop}/products/${product.handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View on partner store"
                          style={{
                            color: "#6b7280",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#666" }}>
                      Partner Price: ${product.price.toFixed(2)}
                      {product.sku && ` | SKU: ${product.sku}`}
                      {product.inventory_quantity !== null && ` | Stock: ${product.inventory_quantity}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
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
                onClick={() => handleProductClick(product)}
                style={{
                  padding: "1rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "";
                }}
              >
                {/* Product Image */}
                <div style={{
                  width: "48px",
                  height: "48px",
                  flexShrink: 0,
                  backgroundColor: "#f3f4f6",
                  borderRadius: "4px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                    {product.title}
                    {product.handle && (
                      <a
                        href={`https://${product.partner_shop}/products/${product.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on partner store"
                        style={{
                          color: "#6b7280",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#666" }}>
                    Partner: ${product.price.toFixed(2)} &rarr; Your Store: ${product.myPrice?.toFixed(2)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
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
                  <button
                    onClick={() => handleRemoveClick(product.partner_variant_id, product.title)}
                    disabled={isLoading}
                    style={{
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "transparent",
                      color: "#dc2626",
                      border: "1px solid #fecaca",
                      borderRadius: "4px",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      fontSize: "0.75rem",
                    }}
                    title="Remove this product from imported list"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {removeProduct && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "1.5rem",
            maxWidth: "400px",
            width: "90%",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", fontWeight: 600 }}>
              Remove Product
            </h3>
            <p style={{ margin: "0 0 1.5rem", color: "#666", fontSize: "0.875rem" }}>
              Are you sure you want to remove <strong>{removeProduct.title}</strong> from your imported products?
              It will appear as available for import again.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={handleRemoveCancel}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "white",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveConfirm}
                disabled={isLoading}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                {isLoading ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        isOpen={!!selectedProduct}
        product={selectedProduct}
        onClose={handleModalClose}
        onImport={handleModalImport}
        priceValue={selectedProduct ? (priceInputs[selectedProduct.partner_variant_id] || "") : ""}
        onPriceChange={(value) => {
          if (selectedProduct) {
            handlePriceChange(selectedProduct.partner_variant_id, value);
          }
        }}
        isLoading={isLoading}
        hasOccCredentials={hasOccCredentials}
      />
    </div>
  );
}
