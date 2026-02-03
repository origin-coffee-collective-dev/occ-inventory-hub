import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { signOutAdmin, ADMIN_SESSION_COOKIE } from "~/lib/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Get session token from cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split("; ").filter(Boolean).map(c => {
      const [key, ...rest] = c.split("=");
      return [key, rest.join("=")];
    })
  );
  const sessionToken = cookies[ADMIN_SESSION_COOKIE];

  // Sign out from Supabase
  if (sessionToken) {
    await signOutAdmin(sessionToken);
  }

  // Clear the cookie and redirect to login
  return redirect("/admin/login", {
    headers: {
      "Set-Cookie": `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
};

// GET request should redirect to admin
export const loader = () => redirect("/admin");
