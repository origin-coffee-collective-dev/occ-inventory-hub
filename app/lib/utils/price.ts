/**
 * Price calculation utilities for margin markup
 *
 * Formula: my_price = partner_price / (1 - margin)
 *
 * Example with 30% margin:
 * - Partner price: $70
 * - My price: $70 / (1 - 0.30) = $70 / 0.70 = $100
 * - My profit: $100 - $70 = $30 (which is 30% of $100)
 */

const DEFAULT_MARGIN = 0.30;

/**
 * Calculate the selling price based on partner cost and desired margin
 */
export function calculateSellingPrice(partnerPrice: number, margin?: number): number {
  const effectiveMargin = margin ?? getDefaultMargin();

  if (effectiveMargin < 0 || effectiveMargin >= 1) {
    throw new Error('Margin must be between 0 and 1 (exclusive)');
  }

  if (partnerPrice < 0) {
    throw new Error('Partner price cannot be negative');
  }

  const sellingPrice = partnerPrice / (1 - effectiveMargin);

  // Round to 2 decimal places
  return Math.round(sellingPrice * 100) / 100;
}

/**
 * Calculate the margin given partner cost and selling price
 */
export function calculateMargin(partnerPrice: number, sellingPrice: number): number {
  if (sellingPrice === 0) {
    return 0;
  }

  const margin = 1 - (partnerPrice / sellingPrice);
  return Math.round(margin * 10000) / 10000; // 4 decimal places
}

/**
 * Get the default margin from environment or fallback
 */
export function getDefaultMargin(): number {
  const envMargin = process.env.DEFAULT_MARGIN;
  if (envMargin) {
    const parsed = parseFloat(envMargin);
    if (!isNaN(parsed) && parsed >= 0 && parsed < 1) {
      return parsed;
    }
  }
  return DEFAULT_MARGIN;
}

/**
 * Format price as string for Shopify API
 */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}

/**
 * Parse price string from Shopify API
 */
export function parsePrice(priceString: string): number {
  const parsed = parseFloat(priceString);
  return isNaN(parsed) ? 0 : parsed;
}
