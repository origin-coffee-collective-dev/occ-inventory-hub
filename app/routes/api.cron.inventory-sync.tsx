/**
 * Cron endpoint for inventory sync.
 *
 * GET with valid CRON_SECRET bearer token → runs sync (Vercel Cron)
 *   - Checks app_settings for enabled/interval gating before running
 * GET without auth → health check ping
 * POST with admin session or CRON_SECRET → runs sync (manual "Sync Now" button)
 *
 * Auth: Validates admin session cookie OR CRON_SECRET bearer token.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { ADMIN_SESSION_COOKIE, verifyAdminSession, getAppSettings, getLatestInventorySyncLog } from "~/lib/supabase.server";
import { runInventorySync } from "~/lib/inventory/sync.server";

function isCronAuthenticated(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

async function isAuthorized(request: Request): Promise<boolean> {
  // Check bearer token (for cron jobs)
  if (isCronAuthenticated(request)) return true;

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Vercel Cron hits this endpoint with GET + Authorization header
  if (isCronAuthenticated(request)) {
    // Application-level gating: check settings before running sync
    const { data: settings } = await getAppSettings();

    // If sync is disabled, skip
    if (settings && !settings.inventory_sync_enabled) {
      return Response.json({
        skipped: true,
        reason: "disabled",
        trigger: "cron",
      });
    }

    // If interval hasn't elapsed since last completed sync, skip
    if (settings) {
      const { data: lastSync } = await getLatestInventorySyncLog();
      if (lastSync?.completed_at) {
        const lastSyncTime = new Date(lastSync.completed_at).getTime();
        const now = Date.now();
        const intervalMs = settings.inventory_sync_interval_minutes * 60 * 1000;
        if (now - lastSyncTime < intervalMs) {
          return Response.json({
            skipped: true,
            reason: "interval_not_reached",
            trigger: "cron",
            nextSyncEligibleAt: new Date(lastSyncTime + intervalMs).toISOString(),
          });
        }
      }
    }

    const result = await runInventorySync();
    return Response.json({
      success: result.success,
      trigger: "cron",
      partnersProcessed: result.partnersProcessed,
      totalItemsProcessed: result.totalItemsProcessed,
      totalItemsUpdated: result.totalItemsUpdated,
      totalItemsFailed: result.totalItemsFailed,
      totalItemsSkipped: result.totalItemsSkipped,
      errors: result.errors,
    });
  }

  // Unauthenticated GET → health check
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
