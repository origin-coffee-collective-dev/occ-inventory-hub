import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form, redirect, useNavigation } from "react-router";
import { getValidOwnerStoreToken, refreshOwnerStoreToken, type TokenStatus } from "~/lib/ownerStore.server";
import { requireAdminSession } from "~/lib/supabase.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { colors } from "~/lib/tokens";

interface LoaderData {
  occStoreDomain: string | null;
  status: TokenStatus;
  expiresAt: string | null;
  error: string | null;
}

interface ActionData {
  success: boolean;
  error?: string;
}

export const loader = async ({ request: _request }: LoaderFunctionArgs) => {
  const tokenResult = await getValidOwnerStoreToken();

  return {
    occStoreDomain: tokenResult.shop,
    status: tokenResult.status,
    expiresAt: tokenResult.expiresAt,
    error: tokenResult.error,
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdminSession(request);

  // Force refresh the token using client credentials
  const tokenResult = await refreshOwnerStoreToken();

  if (tokenResult.status === 'connected') {
    return redirect("/admin?store_connected=true");
  }

  return {
    success: false,
    error: tokenResult.error || "Failed to connect store",
  } satisfies ActionData;
};

export default function AdminConnectStore() {
  const { occStoreDomain, status, expiresAt, error: loaderError } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const isSubmitting = navigation.state === "submitting";

  // Close modal when submission completes
  useEffect(() => {
    if (navigation.state === "idle" && showConfirm) {
      setShowConfirm(false);
    }
  }, [navigation.state, showConfirm]);

  // Format token expiry time
  const formatExpiresAt = (isoString: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    return `${diffMins}m`;
  };

  const isConnected = status === 'connected';
  const isNotConfigured = status === 'not_configured';

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>
        Connect Parent Store
      </h1>

      {/* Config Error */}
      {isNotConfigured && (
        <div style={{
          backgroundColor: colors.error.light,
          border: `1px solid ${colors.error.border}`,
          color: colors.error.text,
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          <strong>Configuration Error:</strong> OCC_STORE_DOMAIN environment variable is not set.
        </div>
      )}

      {/* Connection Status */}
      {!isNotConfigured && (
        <div style={{
          backgroundColor: isConnected ? colors.success.light : status === 'error' ? colors.error.light : colors.warning.light,
          border: `1px solid ${isConnected ? colors.success.border : status === 'error' ? colors.error.border : colors.warning.border}`,
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1.5rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{
              color: isConnected ? colors.success.default : status === 'error' ? colors.error.default : colors.warning.icon,
              fontSize: "1.25rem"
            }}>
              {isConnected ? "✓" : status === 'error' ? "✕" : "○"}
            </span>
            <strong style={{
              color: isConnected ? colors.success.default : status === 'error' ? colors.error.default : colors.warning.text
            }}>
              {isConnected ? "Store Connected" : status === 'error' ? "Connection Error" : "Store Not Connected"}
            </strong>
          </div>
          <p style={{
            margin: 0,
            color: isConnected ? colors.success.textDark : status === 'error' ? colors.error.textDark : colors.warning.text
          }}>
            {occStoreDomain}
            {isConnected && expiresAt && (
              <span style={{ marginLeft: "0.5rem", opacity: 0.8 }}>
                (token expires in {formatExpiresAt(expiresAt)})
              </span>
            )}
          </p>
          {loaderError && status === 'error' && (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: colors.error.textDark }}>
              {loaderError}
            </p>
          )}
        </div>
      )}

      {/* Connect Form */}
      {!isNotConfigured && (
        <div style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <p style={{ marginTop: 0, marginBottom: "1rem", color: colors.text.muted }}>
            {isConnected
              ? "Store is connected. Click Refresh Token to get a new access token if needed."
              : "Click below to connect to your Shopify store using client credentials. This enables product imports and inventory sync."}
          </p>

          {actionData?.error && (
            <div style={{
              backgroundColor: colors.error.light,
              border: `1px solid ${colors.error.border}`,
              color: colors.error.text,
              padding: "1rem",
              borderRadius: "4px",
              marginBottom: "1rem",
            }}>
              {actionData.error}
            </div>
          )}

          <Form method="post" ref={formRef}>
            <button
              type={isConnected ? "button" : "submit"}
              onClick={isConnected ? () => setShowConfirm(true) : undefined}
              disabled={isSubmitting}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: isSubmitting ? colors.interactive.disabled : colors.primary.default,
                color: colors.text.inverse,
                border: "none",
                borderRadius: "4px",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontSize: "1rem",
                fontWeight: 500,
              }}
            >
              {isSubmitting ? "Connecting..." : isConnected ? "Refresh Token" : "Connect Store"}
            </button>
          </Form>

          <ConfirmModal
            isOpen={showConfirm}
            title="Refresh Access Token?"
            message="This will request a new access token from Shopify. The current token will be replaced."
            confirmLabel="Refresh Token"
            cancelLabel="Cancel"
            onConfirm={() => formRef.current?.submit()}
            onCancel={() => setShowConfirm(false)}
            isLoading={isSubmitting}
          />

          <p style={{ marginTop: "1rem", marginBottom: 0, fontSize: "0.875rem", color: colors.text.muted }}>
            The app uses client credentials to obtain an access token. No redirect required.
            Tokens are automatically refreshed when they expire.
          </p>
        </div>
      )}

      {/* Back Link */}
      <div style={{ marginTop: "1.5rem" }}>
        <a
          href="/admin"
          style={{
            color: colors.interactive.link,
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          &larr; Back to Dashboard
        </a>
      </div>
    </div>
  );
}
