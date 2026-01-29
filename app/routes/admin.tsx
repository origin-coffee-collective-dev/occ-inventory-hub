import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, Form, useLoaderData } from "react-router";
import { verifyAdminSession, ADMIN_SESSION_COOKIE } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import { LogOut, Package } from "lucide-react";

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [cookieName, ...rest] = cookie.split("=");
    if (cookieName === name) {
      return rest.join("=");
    }
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Skip auth check for login page
  if (url.pathname === "/admin/login") {
    return { email: null };
  }

  const cookieHeader = request.headers.get("Cookie");
  const sessionToken = parseCookie(cookieHeader, ADMIN_SESSION_COOKIE);

  const { isValid, email } = await verifyAdminSession(sessionToken);

  if (!isValid) {
    return redirect("/admin/login");
  }

  return { email };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "logout") {
    // Clear the session cookie
    return redirect("/admin/login", {
      headers: {
        "Set-Cookie": `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  return null;
};

export default function AdminLayout() {
  const { email } = useLoaderData<typeof loader>();

  // If no email, this is the login page - just render outlet
  if (!email) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6" />
            <span className="font-semibold text-lg">OCC Inventory Hub</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{email}</span>
            <Form method="post">
              <input type="hidden" name="intent" value="logout" />
              <Button variant="outline" size="sm" type="submit">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </Form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
