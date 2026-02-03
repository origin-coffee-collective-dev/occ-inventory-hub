/**
 * Design Tokens
 *
 * Centralized design tokens for consistent styling across the application.
 * DO NOT use magic hex codes in components - always use these tokens.
 */

export const colors = {
  // ===================
  // Brand / Primary
  // ===================
  primary: {
    default: "#1a1a1a",
    hover: "#333333",
    text: "white",
  },

  // ===================
  // Text Colors
  // ===================
  text: {
    primary: "#1a1a1a",
    secondary: "#374151", // gray-700
    tertiary: "#4b5563", // gray-600
    muted: "#666666",
    light: "#6b7280", // gray-500
    lighter: "#8c9196",
    disabled: "#9ca3af", // gray-400
    inverse: "white",
  },

  // ===================
  // Background Colors
  // ===================
  background: {
    page: "#f4f6f8",
    card: "white",
    subtle: "#f6f6f7",
    muted: "#f3f4f6", // gray-100
    hover: "#f9fafb", // gray-50
  },

  // ===================
  // Border Colors
  // ===================
  border: {
    default: "#e5e7eb", // gray-200
    strong: "#d1d5db", // gray-300
  },

  // ===================
  // Status: Success
  // ===================
  success: {
    default: "#16a34a", // green-600
    hover: "#15803d", // green-700
    light: "#dcfce7", // green-100
    text: "#16a34a",
    // Shopify green variant
    shopify: "#008060",
  },

  // ===================
  // Status: Error / Danger
  // ===================
  error: {
    default: "#dc2626", // red-600
    hover: "#b91c1c", // red-700
    light: "#fef2f2", // red-50
    border: "#fecaca", // red-200
    text: "#dc2626",
    // Shopify red variant
    shopify: "#d72c0d",
  },

  // ===================
  // Status: Warning
  // ===================
  warning: {
    default: "#f59e0b", // amber-500
    light: "#fef3c7", // amber-100
    border: "#f59e0b", // amber-500
    text: "#92400e", // amber-800
  },

  // ===================
  // Status: Info
  // ===================
  info: {
    default: "#2563eb", // blue-600
    light: "#dbeafe", // blue-100
    text: "#2563eb",
  },

  // ===================
  // Interactive Elements
  // ===================
  interactive: {
    link: "#2563eb", // blue-600
    linkHover: "#1d4ed8", // blue-700
    disabled: "#9ca3af", // gray-400
  },

  // ===================
  // Icon Colors
  // ===================
  icon: {
    default: "#6b7280", // gray-500
    muted: "#9ca3af", // gray-400
  },
} as const;

/**
 * Type-safe color accessor
 * Usage: getColor('text', 'primary') or getColor('success', 'default')
 */
export type ColorCategory = keyof typeof colors;
export type ColorShade<T extends ColorCategory> = keyof (typeof colors)[T];

export function getColor<T extends ColorCategory>(
  category: T,
  shade: ColorShade<T>
): string {
  return colors[category][shade] as string;
}
