import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import type { Session } from "@shopify/shopify-api";
import {
  storeSession,
  loadSession,
  deleteSession,
  deleteSessions,
  findSessionsByShop,
  type SessionRecord,
} from "./lib/supabase.server";

// Convert Supabase record to Shopify Session
function recordToSession(record: SessionRecord): Session {
  return {
    id: record.id,
    shop: record.shop,
    state: record.state,
    isOnline: record.is_online,
    scope: record.scope ?? undefined,
    expires: record.expires ? new Date(record.expires) : undefined,
    accessToken: record.access_token,
    onlineAccessInfo: record.user_id ? {
      expires_in: 0, // Not stored, will be recalculated
      associated_user_scope: record.scope ?? "",
      associated_user: {
        id: parseInt(record.user_id, 10),
        first_name: record.first_name ?? "",
        last_name: record.last_name ?? "",
        email: record.email ?? "",
        email_verified: record.email_verified ?? false,
        account_owner: record.account_owner,
        locale: record.locale ?? "en",
        collaborator: record.collaborator ?? false,
      },
    } : undefined,
  } as Session;
}

// Custom Supabase session storage class
class SupabaseSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const { success } = await storeSession({
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires,
      accessToken: session.accessToken ?? "",
      onlineAccessInfo: session.onlineAccessInfo,
    });
    return success;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const { data } = await loadSession(id);
    if (!data) return undefined;
    return recordToSession(data);
  }

  async deleteSession(id: string): Promise<boolean> {
    const { success } = await deleteSession(id);
    return success;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    const { success } = await deleteSessions(ids);
    return success;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const { data } = await findSessionsByShop(shop);
    return data.map(recordToSession);
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new SupabaseSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
