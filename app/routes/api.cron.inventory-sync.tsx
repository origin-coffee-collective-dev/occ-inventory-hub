/**
 * Cron endpoint for inventory sync.
 *
 * Iteration 1: Minimal stub — can be triggered manually via POST.
 * Iteration 2: Will add Vercel cron schedule + CRON_SECRET auth.
 *
 * Auth: Validates admin session cookie OR CRON_SECRET bearer token.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "~/lib/supabase.server";
import { runInventorySync } from "~/lib/inventory/sync.server";

async function isAuthorized(request: Request): Promise<boolean> {
  // Check bearer token (for cron jobs)
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return true;
    }
  }

  // Check admin session cookie (for manual triggers)
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, rest.join("=")];
    })
  );
  const sessionToken = cookies[ADMIN_SESSION_COOKIE] || null;
  const session = await verifyAdminSession(sessionToken);
  return session.isValid;
}

export const loader = async (_args: LoaderFunctionArgs) => {
  return Response.json({ status: "ok", endpoint: "inventory-sync" });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const authorized = await isAuthorized(request);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInventorySync();

  return Response.json({
    success: result.success,
    partnersProcessed: result.partnersProcessed,
    totalItemsProcessed: result.totalItemsProcessed,
    totalItemsUpdated: result.totalItemsUpdated,
    totalItemsFailed: result.totalItemsFailed,
    totalItemsSkipped: result.totalItemsSkipped,
    errors: result.errors,
  });
};
