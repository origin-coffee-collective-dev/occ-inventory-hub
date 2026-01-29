/**
 * SKU utilities for partner product mapping
 *
 * Format: PARTNER-{shopPrefix}-{originalSku}
 * Example: PARTNER-roastery-BLEND001
 */

const SKU_PREFIX = 'PARTNER';
const SKU_SEPARATOR = '-';

/**
 * Extract a short shop identifier from the full shop domain
 * e.g., "the-best-roastery.myshopify.com" -> "the-best-roastery"
 */
export function getShopPrefix(shop: string): string {
  // Remove .myshopify.com suffix
  return shop.replace(/\.myshopify\.com$/i, '');
}

/**
 * Generate a SKU for a partner product
 */
export function generatePartnerSku(shop: string, originalSku: string | null): string {
  const shopPrefix = getShopPrefix(shop);
  const sku = originalSku || 'NOSKU';

  // Clean up SKU to be URL-safe and consistent
  const cleanSku = sku
    .toUpperCase()
    .replace(/[^A-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${SKU_PREFIX}${SKU_SEPARATOR}${shopPrefix}${SKU_SEPARATOR}${cleanSku}`;
}

/**
 * Check if a SKU is a partner SKU
 */
export function isPartnerSku(sku: string): boolean {
  return sku.startsWith(`${SKU_PREFIX}${SKU_SEPARATOR}`);
}

/**
 * Parse a partner SKU to extract shop and original SKU
 */
export function parsePartnerSku(sku: string): { shop: string; originalSku: string } | null {
  if (!isPartnerSku(sku)) {
    return null;
  }

  // Format: PARTNER-shopPrefix-originalSku
  const parts = sku.split(SKU_SEPARATOR);

  if (parts.length < 3) {
    return null;
  }

  // Remove PARTNER prefix
  parts.shift();

  // First part is shop prefix
  const shopPrefix = parts.shift()!;

  // Rest is the original SKU
  const originalSku = parts.join(SKU_SEPARATOR);

  return {
    shop: `${shopPrefix}.myshopify.com`,
    originalSku,
  };
}

/**
 * Extract shop from a partner SKU
 */
export function getShopFromSku(sku: string): string | null {
  const parsed = parsePartnerSku(sku);
  return parsed?.shop || null;
}

/**
 * Extract shop prefix from a partner SKU
 */
export function getShopPrefixFromSku(sku: string): string | null {
  if (!isPartnerSku(sku)) {
    return null;
  }

  const parts = sku.split(SKU_SEPARATOR);
  return parts.length >= 2 ? parts[1] : null;
}
