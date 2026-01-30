import crypto from "crypto";

const SCOPES = process.env.SCOPES || "read_products,read_inventory,write_orders";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Validates a shop domain format
 */
export function validateShopDomain(shop: string): string | null {
  // Normalize to include .myshopify.com
  const normalized = shop.includes(".myshopify.com")
    ? shop
    : `${shop}.myshopify.com`;

  // Validate format: alphanumeric and hyphens, followed by .myshopify.com
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  if (!shopRegex.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Generates a CSRF state token with embedded timestamp and shop
 * Format: {timestamp}:{shop}:{signature}
 */
export function generateState(shop: string): string {
  const timestamp = Date.now().toString();
  const data = `${timestamp}:${shop}`;
  const signature = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
    .update(data)
    .digest("hex");

  return Buffer.from(`${data}:${signature}`).toString("base64url");
}

/**
 * Validates a CSRF state token
 * Returns the shop domain if valid, null otherwise
 */
export function validateState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [timestamp, shop, signature] = decoded.split(":");

    if (!timestamp || !shop || !signature) {
      return null;
    }

    // Check timestamp is within TTL
    const stateTime = parseInt(timestamp, 10);
    if (Date.now() - stateTime > STATE_TTL_MS) {
      return null;
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
      .update(`${timestamp}:${shop}`)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    return shop;
  } catch {
    return null;
  }
}

/**
 * Generates the Shopify OAuth authorization URL
 */
export function generateInstallUrl(shop: string, redirectUri: string): string {
  const state = generateState(shop);

  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY || "",
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "offline",
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges an authorization code for an access token
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{ accessToken: string; scope: string } | { error: string }> {
  const url = `https://${shop}/admin/oauth/access_token`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token exchange failed for ${shop}:`, errorText);
      return { error: `Token exchange failed: ${response.status}` };
    }

    const data = (await response.json()) as {
      access_token: string;
      scope: string;
      expires_in?: number;
      associated_user_scope?: string;
      associated_user?: object;
    };

    // Log full response to diagnose token type
    console.log("=== TOKEN EXCHANGE RESPONSE ===");
    console.log("Token prefix:", data.access_token?.substring(0, 10));
    console.log("Has expires_in:", !!data.expires_in);
    console.log("Has associated_user:", !!data.associated_user);
    console.log("Token type:", data.expires_in ? "ONLINE (expires)" : "OFFLINE (permanent)");
    console.log("Full response keys:", Object.keys(data));
    console.log("===============================");

    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  } catch (error) {
    console.error(`Token exchange error for ${shop}:`, error);
    return { error: "Network error during token exchange" };
  }
}

/**
 * Validates the HMAC signature from Shopify's OAuth callback
 */
export function validateHmac(query: URLSearchParams): boolean {
  const hmac = query.get("hmac");
  if (!hmac) {
    return false;
  }

  // Create a copy without the hmac parameter
  const params = new URLSearchParams(query);
  params.delete("hmac");

  // Sort and encode parameters
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET || "")
    .update(sortedParams)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(calculatedHmac));
  } catch {
    return false;
  }
}
