import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useActionData, useNavigation, useSearchParams } from "react-router";
import { signInAdmin, verifyAdminSession, ADMIN_SESSION_COOKIE } from "~/lib/supabase.server";
import { colors } from "~/lib/tokens";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Check if already logged in
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").filter(Boolean).map(c => {
      const [key, ...rest] = c.split("=");
      return [key, rest.join("=")];
    })
  );
  const sessionToken = cookies[ADMIN_SESSION_COOKIE];

  const { isValid } = await verifyAdminSession(sessionToken);
  if (isValid) {
    return redirect("/admin");
  }

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const returnTo = formData.get("returnTo") as string || "/admin";

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const { success, accessToken, error } = await signInAdmin(email, password);

  if (!success || !accessToken) {
    return { error: error || "Invalid credentials" };
  }

  // Set session cookie and redirect
  // Cookie is HTTP-only, secure in production, with 7 day expiry
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = [
    `${ADMIN_SESSION_COOKIE}=${accessToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 7}`, // 7 days
  ];
  if (isProduction) {
    cookieOptions.push("Secure");
  }

  return redirect(returnTo, {
    headers: {
      "Set-Cookie": cookieOptions.join("; "),
    },
  });
};

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin";
  const isSubmitting = navigation.state === "submitting";

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background.subtle,
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        backgroundColor: colors.background.card,
        padding: "2rem",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        width: "100%",
        maxWidth: "400px",
      }}>
        <h1 style={{ margin: "0 0 1.5rem", textAlign: "center", fontSize: "1.5rem" }}>
          OCC Inventory Hub
        </h1>
        <h2 style={{ margin: "0 0 1.5rem", textAlign: "center", fontSize: "1rem", fontWeight: "normal", color: colors.text.muted }}>
          Admin Login
        </h2>

        {actionData?.error && (
          <div style={{
            backgroundColor: colors.error.light,
            border: `1px solid ${colors.error.border}`,
            color: colors.error.text,
            padding: "0.75rem 1rem",
            borderRadius: "4px",
            marginBottom: "1rem",
            fontSize: "0.875rem",
          }}>
            {actionData.error}
          </div>
        )}

        <form method="post">
          <input type="hidden" name="returnTo" value={returnTo} />

          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="email"
              style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: `1px solid ${colors.border.strong}`,
                borderRadius: "4px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="password"
              style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem", fontWeight: 500 }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: `1px solid ${colors.border.strong}`,
                borderRadius: "4px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: isSubmitting ? colors.interactive.disabled : colors.primary.default,
              color: colors.text.inverse,
              border: "none",
              borderRadius: "4px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
