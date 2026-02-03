import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from "~/lib/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Skip auth for login/logout/callback routes (they handle their own auth)
  if (url.pathname === "/admin/login" || url.pathname === "/admin/logout" || url.pathname === "/admin/store-callback") {
    return { email: null };
  }

  // Get session cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").filter(Boolean).map(c => {
      const [key, ...rest] = c.split("=");
      return [key, rest.join("=")];
    })
  );
  const sessionToken = cookies[ADMIN_SESSION_COOKIE];

  // Verify session
  const { isValid, email } = await verifyAdminSession(sessionToken);

  if (!isValid) {
    // Redirect to login
    const returnTo = url.pathname + url.search;
    return redirect(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return { email };
};

export default function AdminLayout() {
  const { email } = useLoaderData<typeof loader>();

  // If no email, render just the outlet (for login/logout pages)
  if (!email) {
    return <Outlet />;
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", backgroundColor: "#f6f6f7" }}>
      {/* Admin Header */}
      <header style={{
        backgroundColor: "#1a1a1a",
        color: "white",
        padding: "1rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
            OCC Inventory Hub
          </h1>
          <nav style={{ display: "flex", gap: "1.5rem" }}>
            <a href="/admin" style={{ color: "white", textDecoration: "none" }}>
              Dashboard
            </a>
            <a href="/admin/partners" style={{ color: "white", textDecoration: "none" }}>
              Partners
            </a>
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>{email}</span>
          <form action="/admin/logout" method="post">
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.3)",
                color: "white",
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Sign Out
            </button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
