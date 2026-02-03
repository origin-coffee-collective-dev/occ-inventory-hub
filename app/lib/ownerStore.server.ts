import { getOwnerStore, upsertOwnerStore } from "./supabase.server";

// Refresh token if it expires within 5 minutes
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type TokenStatus = 'connected' | 'expired' | 'error' | 'not_configured';

export interface TokenResult {
  status: TokenStatus;
  shop: string | null;
  accessToken: string | null;
  expiresAt: string | null;
  error: string | null;
}

interface ClientCredentialsResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

// Fetch a new token using client credentials grant
async function fetchTokenViaClientCredentials(shop: string): Promise<{
  accessToken: string;
  scope: string;
  expiresIn: number;
}> {
  // Use dedicated credentials for the parent store app (occ-main-api)
  const clientId = process.env.OCC_PARENT_CLIENT_ID;
  const clientSecret = process.env.OCC_PARENT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing OCC_PARENT_CLIENT_ID or OCC_PARENT_CLIENT_SECRET");
  }

  const response = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch token: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as ClientCredentialsResponse;
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresIn: data.expires_in, // 86399 seconds (24h)
  };
}

// Get a valid owner store token, auto-refreshing if needed
export async function getValidOwnerStoreToken(): Promise<TokenResult> {
  const storeDomain = process.env.OCC_STORE_DOMAIN;

  if (!storeDomain) {
    return {
      status: 'not_configured',
      shop: null,
      accessToken: null,
      expiresAt: null,
      error: 'OCC_STORE_DOMAIN not set',
    };
  }

  const { data: ownerStore, error: dbError } = await getOwnerStore();

  if (dbError) {
    return {
      status: 'error',
      shop: storeDomain,
      accessToken: null,
      expiresAt: null,
      error: dbError,
    };
  }

  const now = new Date();
  const expiresAt = ownerStore?.expires_at ? new Date(ownerStore.expires_at) : null;

  // Determine if we need to refresh the token
  const needsRefresh = !ownerStore?.access_token ||
    !expiresAt ||
    (expiresAt.getTime() - now.getTime()) < REFRESH_BUFFER_MS;

  if (needsRefresh) {
    try {
      const newToken = await fetchTokenViaClientCredentials(storeDomain);
      const newExpiresAt = new Date(now.getTime() + newToken.expiresIn * 1000);

      const { error: upsertError } = await upsertOwnerStore(
        storeDomain,
        newToken.accessToken,
        newToken.scope,
        newExpiresAt
      );

      if (upsertError) {
        return {
          status: 'error',
          shop: storeDomain,
          accessToken: null,
          expiresAt: null,
          error: upsertError,
        };
      }

      return {
        status: 'connected',
        shop: storeDomain,
        accessToken: newToken.accessToken,
        expiresAt: newExpiresAt.toISOString(),
        error: null,
      };
    } catch (err) {
      return {
        status: 'error',
        shop: storeDomain,
        accessToken: null,
        expiresAt: null,
        error: err instanceof Error ? err.message : 'Failed to refresh token',
      };
    }
  }

  // Token is still valid
  return {
    status: 'connected',
    shop: storeDomain,
    accessToken: ownerStore!.access_token,
    expiresAt: ownerStore!.expires_at,
    error: null,
  };
}

// Force a token refresh (for manual reconnect)
export async function refreshOwnerStoreToken(): Promise<TokenResult> {
  const storeDomain = process.env.OCC_STORE_DOMAIN;

  if (!storeDomain) {
    return {
      status: 'not_configured',
      shop: null,
      accessToken: null,
      expiresAt: null,
      error: 'OCC_STORE_DOMAIN not set',
    };
  }

  try {
    const now = new Date();
    const newToken = await fetchTokenViaClientCredentials(storeDomain);
    const newExpiresAt = new Date(now.getTime() + newToken.expiresIn * 1000);

    const { error: upsertError } = await upsertOwnerStore(
      storeDomain,
      newToken.accessToken,
      newToken.scope,
      newExpiresAt
    );

    if (upsertError) {
      return {
        status: 'error',
        shop: storeDomain,
        accessToken: null,
        expiresAt: null,
        error: upsertError,
      };
    }

    return {
      status: 'connected',
      shop: storeDomain,
      accessToken: newToken.accessToken,
      expiresAt: newExpiresAt.toISOString(),
      error: null,
    };
  } catch (err) {
    return {
      status: 'error',
      shop: storeDomain,
      accessToken: null,
      expiresAt: null,
      error: err instanceof Error ? err.message : 'Failed to refresh token',
    };
  }
}
