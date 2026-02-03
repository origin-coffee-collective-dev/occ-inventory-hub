import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form, redirect } from "react-router";
import { generateInstallUrl } from "~/lib/partners/oauth.server";
import { getOwnerStore } from "~/lib/supabase.server";

interface LoaderData {
  occStoreDomain: string;
  isConnected: boolean;
  connectedAt: string | null;
  error?: string;
  debug?: string;
}

interface ActionData {
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const occStoreDomain = process.env.OCC_STORE_DOMAIN;

  // Debug info - remove after troubleshooting
  const envKeysWithOccOrStore = Object.keys(process.env).filter(k => k.includes("OCC") || k.includes("STORE") || k.includes("SHOPIFY"));
  const debugInfo = `OCC_STORE_DOMAIN="${occStoreDomain || "(undefined)"}" | Relevant env keys: ${envKeysWithOccOrStore.join(", ") || "(none)"}`;

  if (!occStoreDomain) {
    return {
      occStoreDomain: "",
      isConnected: false,
      connectedAt: null,
      error: "OCC_STORE_DOMAIN environment variable is not set",
      debug: debugInfo,
    } satisfies LoaderData;
  }

  // Get current owner store status
  const { data: ownerStore } = await getOwnerStore();
  const isConnected = ownerStore?.shop === occStoreDomain && !!ownerStore?.access_token;

  return {
    occStoreDomain,
    isConnected,
    connectedAt: ownerStore?.connected_at ?? null,
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const occStoreDomain = process.env.OCC_STORE_DOMAIN;

  if (!occStoreDomain) {
    return { error: "OCC_STORE_DOMAIN environment variable is not set" } satisfies ActionData;
  }

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    console.error("SHOPIFY_APP_URL environment variable is not set");
    return { error: "App configuration error. SHOPIFY_APP_URL not set." } satisfies ActionData;
  }

  // Generate OAuth URL with callback to admin store-callback route
  // Parent store needs write_products to create imported products
  const redirectUri = `${appUrl}/admin/store-callback`;
  const ownerStoreScopes = "read_products,write_products,read_inventory,write_inventory";
  const installUrl = generateInstallUrl(occStoreDomain, redirectUri, ownerStoreScopes);

  return redirect(installUrl);
};

export default function AdminConnectStore() {
  const { occStoreDomain, isConnected, connectedAt, error: loaderError, debug } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Connect Parent Store
      </h1>

      {/* Debug Info - remove after troubleshooting */}
      {debug && (
        <div style={{
          backgroundColor: "#f3f4f6",
          border: "1px solid #d1d5db",
          color: "#374151",
          padding: "0.75rem",
          borderRadius: "4px",
          marginBottom: "1rem",
          fontFamily: "monospace",
          fontSize: "0.75rem",
          wordBreak: "break-all",
        }}>
          <strong>DEBUG:</strong> {debug}
        </div>
      )}

      {/* Config Error */}
      {loaderError && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          <strong>Configuration Error:</strong> {loaderError}
        </div>
      )}

      {/* Connection Status */}
      {occStoreDomain && (
        <div style={{
          backgroundColor: isConnected ? "#dcfce7" : "#fef3c7",
          border: `1px solid ${isConnected ? "#86efac" : "#fcd34d"}`,
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ color: isConnected ? "#16a34a" : "#d97706", fontSize: "1.25rem" }}>
              {isConnected ? "✓" : "○"}
            </span>
            <strong style={{ color: isConnected ? "#16a34a" : "#92400e" }}>
              {isConnected ? "Store Connected" : "Store Not Connected"}
            </strong>
          </div>
          <p style={{ margin: 0, color: isConnected ? "#166534" : "#92400e" }}>
            {occStoreDomain}
            {connectedAt && isConnected && (
              <span style={{ marginLeft: "0.5rem", opacity: 0.8 }}>
                (connected {new Date(connectedAt).toLocaleDateString()})
              </span>
            )}
          </p>
        </div>
      )}

      {/* Connect Form */}
      {occStoreDomain && (
        <div style={{
          backgroundColor: "white",
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ marginTop: 0, marginBottom: "1rem", color: "#666" }}>
            {isConnected
              ? "Store is connected. You can reconnect to refresh the OAuth token if needed."
              : "Click below to authorize the app on your Shopify store. This enables product imports and inventory sync."}
          </p>

          {actionData?.error && (
            <div style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              padding: "1rem",
              borderRadius: "4px",
              marginBottom: "1rem",
            }}>
              {actionData.error}
            </div>
          )}

          <Form method="post">
            <button
              type="submit"
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#1a1a1a",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: 500,
              }}
            >
              {isConnected ? "Reconnect Store" : "Connect Store"}
            </button>
          </Form>

          <p style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.875rem", color: "#666" }}>
            You will be redirected to Shopify to authorize the app. The app requires read/write access to products and inventory.
          </p>
        </div>
      )}

      {/* Back Link */}
      <div style={{ marginTop: "1.5rem" }}>
        <a
          href="/admin"
          style={{
            color: "#2563eb",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
