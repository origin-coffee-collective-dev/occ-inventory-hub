import { useEffect, useRef } from "react";
import type { PartnerProductRecord } from "~/lib/supabase.server";

interface ProductDetailModalProps {
  isOpen: boolean;
  product: (PartnerProductRecord & { isImported: boolean; myPrice: number | null }) | null;
  onClose: () => void;
  onImport?: (variantId: string, price: string) => void;
  priceValue?: string;
  onPriceChange?: (value: string) => void;
  isLoading?: boolean;
  hasOccCredentials?: boolean;
}

export function ProductDetailModal({
  isOpen,
  product,
  onClose,
  onImport,
  priceValue = "",
  onPriceChange,
  isLoading = false,
  hasOccCredentials = true,
}: ProductDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleImportClick = () => {
    if (onImport && priceValue && parseFloat(priceValue) > 0) {
      onImport(product.partner_variant_id, priceValue);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 20px rgba(0, 0, 0, 0.1)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              {product.is_new && (
                <span
                  style={{
                    backgroundColor: "#dbeafe",
                    color: "#2563eb",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  New
                </span>
              )}
              {product.isImported && (
                <span
                  style={{
                    backgroundColor: "#dcfce7",
                    color: "#16a34a",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  Imported
                </span>
              )}
              <h2
                id="product-modal-title"
                style={{
                  margin: 0,
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {product.title}
              </h2>
            </div>
            {product.handle && (
              <a
                href={`https://${product.partner_shop}/products/${product.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#2563eb",
                  fontSize: "0.875rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  marginTop: "0.25rem",
                }}
              >
                View on partner store
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              padding: "0.25rem",
              cursor: "pointer",
              color: "#6b7280",
              flexShrink: 0,
            }}
            aria-label="Close modal"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "1.5rem",
          }}
        >
          {/* Product Image */}
          <div
            style={{
              width: "100%",
              aspectRatio: "1",
              maxHeight: "300px",
              backgroundColor: "#f3f4f6",
              borderRadius: "8px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1.5rem",
            }}
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            ) : (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            )}
          </div>

          {/* Price Information */}
          <div
            style={{
              backgroundColor: "#f9fafb",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  Partner Price
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                  ${product.price.toFixed(2)}
                </div>
              </div>
              {product.compare_at_price && product.compare_at_price > product.price && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                    Compare At
                  </div>
                  <div
                    style={{
                      fontSize: "1.5rem",
                      fontWeight: 600,
                      color: "#9ca3af",
                      textDecoration: "line-through",
                    }}
                  >
                    ${product.compare_at_price.toFixed(2)}
                  </div>
                </div>
              )}
              {product.isImported && product.myPrice !== null && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                    Your Store Price
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "#16a34a" }}>
                    ${product.myPrice.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                Description
              </h3>
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "#4b5563",
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </div>
          )}

          {/* Product Details */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem", color: "#374151" }}>
              Product Details
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "0.75rem",
                fontSize: "0.875rem",
              }}
            >
              {product.vendor && (
                <div>
                  <span style={{ color: "#6b7280" }}>Vendor: </span>
                  <span style={{ fontWeight: 500 }}>{product.vendor}</span>
                </div>
              )}
              {product.product_type && (
                <div>
                  <span style={{ color: "#6b7280" }}>Type: </span>
                  <span style={{ fontWeight: 500 }}>{product.product_type}</span>
                </div>
              )}
              {product.sku && (
                <div>
                  <span style={{ color: "#6b7280" }}>SKU: </span>
                  <span style={{ fontWeight: 500, fontFamily: "monospace" }}>{product.sku}</span>
                </div>
              )}
              {product.barcode && (
                <div>
                  <span style={{ color: "#6b7280" }}>Barcode: </span>
                  <span style={{ fontWeight: 500, fontFamily: "monospace" }}>{product.barcode}</span>
                </div>
              )}
              <div>
                <span style={{ color: "#6b7280" }}>Stock: </span>
                <span
                  style={{
                    fontWeight: 500,
                    color:
                      product.inventory_quantity === null
                        ? "#6b7280"
                        : product.inventory_quantity > 0
                        ? "#16a34a"
                        : "#dc2626",
                  }}
                >
                  {product.inventory_quantity ?? "Not tracked"}
                </span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                Tags
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {product.tags.map((tag, index) => (
                  <span
                    key={index}
                    style={{
                      backgroundColor: "#e5e7eb",
                      color: "#374151",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sync Information */}
          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              paddingTop: "1rem",
              fontSize: "0.75rem",
              color: "#6b7280",
            }}
          >
            <div>First seen: {formatDate(product.first_seen_at)}</div>
            <div>Last synced: {formatDate(product.last_synced_at)}</div>
          </div>
        </div>

        {/* Footer - Import controls for non-imported products */}
        {!product.isImported && (
          <div
            style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="modal-price-input" style={{ fontSize: "0.875rem", color: "#374151" }}>
                Your Price:
              </label>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ marginRight: "0.25rem" }}>$</span>
                <input
                  id="modal-price-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceValue}
                  onChange={(e) => onPriceChange?.(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: "100px",
                    padding: "0.5rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleImportClick}
              disabled={isLoading || !priceValue || parseFloat(priceValue) <= 0 || !hasOccCredentials}
              style={{
                padding: "0.5rem 1.5rem",
                backgroundColor:
                  isLoading || !priceValue || parseFloat(priceValue) <= 0 || !hasOccCredentials
                    ? "#9ca3af"
                    : "#16a34a",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor:
                  isLoading || !priceValue || parseFloat(priceValue) <= 0 || !hasOccCredentials
                    ? "not-allowed"
                    : "pointer",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              {isLoading ? "Importing..." : "Import Product"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
