/**
 * Email Templates for Sync Failure Alerts
 *
 * Provides HTML and plain text email templates for critical sync failures.
 */

import type { CriticalSyncError } from "~/types/database";

// App URL for links in emails
const APP_URL = process.env.SHOPIFY_APP_URL || "https://your-app.vercel.app";

/**
 * Build email content for a critical sync failure
 */
export function buildSyncFailureEmail(error: CriticalSyncError): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = getEmailSubject(error);
  const html = buildHtmlEmail(error);
  const text = buildTextEmail(error);

  return { subject, html, text };
}

/**
 * Get the email subject based on error type
 */
function getEmailSubject(error: CriticalSyncError): string {
  switch (error.type) {
    case "token_revoked":
      return `[OCC Alert] Partner Token Revoked: ${formatShopName(error.partnerShop)}`;
    case "store_unreachable":
      return `[OCC Alert] Partner Store Unreachable: ${formatShopName(error.partnerShop)}`;
    case "high_failure_rate":
      return `[OCC Alert] High Sync Failure Rate: ${formatShopName(error.partnerShop)}`;
    case "consecutive_failures":
      return `[OCC Alert] Consecutive Sync Failures: ${formatShopName(error.partnerShop)}`;
    case "owner_store_disconnected":
      return `[OCC Alert] Owner Store Disconnected - Inventory Sync Halted`;
    default:
      return `[OCC Alert] Inventory Sync Failure`;
  }
}

/**
 * Format shop name for display
 */
function formatShopName(shop: string): string {
  return shop.replace(".myshopify.com", "");
}

/**
 * Get a human-readable error type description
 */
function getErrorTypeDescription(error: CriticalSyncError): string {
  switch (error.type) {
    case "token_revoked":
      return "Access Token Revoked";
    case "store_unreachable":
      return "Store Unreachable";
    case "high_failure_rate":
      return "High Failure Rate";
    case "consecutive_failures":
      return "Consecutive Failures";
    case "owner_store_disconnected":
      return "Owner Store Disconnected";
    default:
      return "Unknown Error";
  }
}

/**
 * Get recommended action based on error type
 */
function getRecommendedAction(error: CriticalSyncError): string {
  switch (error.type) {
    case "token_revoked":
      return "The partner needs to reinstall the app to grant a new access token. Contact them to request reinstallation.";
    case "store_unreachable":
      return "This may be a temporary issue with the partner's store or Shopify. If the problem persists, contact the partner.";
    case "high_failure_rate":
      return "Review the error details below. This may indicate issues with specific products or the partner's inventory data.";
    case "consecutive_failures":
      return "Multiple consecutive sync attempts have failed. Review the partner's connection status in the admin dashboard.";
    case "owner_store_disconnected":
      return "Refresh the owner store token in the admin dashboard. If the issue persists, check the OCC_PARENT_CLIENT_ID and OCC_PARENT_CLIENT_SECRET environment variables.";
    default:
      return "Review the error details and check the admin dashboard for more information.";
  }
}

/**
 * Build the HTML email template
 */
function buildHtmlEmail(error: CriticalSyncError): string {
  const dashboardUrl = `${APP_URL}/admin/inventory-sync`;
  const partnersUrl = `${APP_URL}/admin/partners`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OCC Inventory Sync Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">

  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <h1 style="color: #dc2626; margin: 0 0 8px 0; font-size: 20px;">
      Inventory Sync Alert
    </h1>
    <p style="margin: 0; color: #991b1b; font-weight: 500;">
      ${getErrorTypeDescription(error)}
    </p>
  </div>

  <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6b7280; width: 140px;">Partner:</td>
        <td style="padding: 8px 0; font-weight: 500;">${formatShopName(error.partnerShop)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Error Type:</td>
        <td style="padding: 8px 0; font-weight: 500;">${getErrorTypeDescription(error)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Time:</td>
        <td style="padding: 8px 0;">${new Date().toLocaleString()}</td>
      </tr>
      ${error.consecutiveFailures ? `
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Consecutive Failures:</td>
        <td style="padding: 8px 0; color: #dc2626; font-weight: 500;">${error.consecutiveFailures}</td>
      </tr>
      ` : ""}
      ${error.failureRate !== undefined ? `
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Failure Rate:</td>
        <td style="padding: 8px 0; color: #dc2626; font-weight: 500;">${Math.round(error.failureRate * 100)}%</td>
      </tr>
      ` : ""}
    </table>
  </div>

  <div style="margin-bottom: 24px;">
    <h2 style="font-size: 16px; margin: 0 0 8px 0;">Message</h2>
    <p style="margin: 0; color: #374151;">${error.message}</p>
  </div>

  ${error.details ? `
  <div style="margin-bottom: 24px;">
    <h2 style="font-size: 16px; margin: 0 0 8px 0;">Error Details</h2>
    <div style="background-color: #f3f4f6; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 13px; color: #374151; white-space: pre-wrap; word-break: break-word;">
${escapeHtml(error.details)}
    </div>
  </div>
  ` : ""}

  <div style="background-color: #dbeafe; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <h2 style="font-size: 16px; margin: 0 0 8px 0; color: #1e40af;">Recommended Action</h2>
    <p style="margin: 0; color: #1e40af;">${getRecommendedAction(error)}</p>
  </div>

  <div style="text-align: center; padding: 16px 0; border-top: 1px solid #e5e7eb;">
    <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1a1a1a; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin-right: 8px;">
      View Sync Dashboard
    </a>
    <a href="${partnersUrl}" style="display: inline-block; padding: 12px 24px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 6px; font-weight: 500;">
      View Partners
    </a>
  </div>

  <p style="color: #9ca3af; font-size: 13px; text-align: center; margin-top: 24px;">
    This is an automated alert from OCC Inventory Hub.
  </p>
</body>
</html>
  `.trim();
}

/**
 * Build the plain text email template
 */
function buildTextEmail(error: CriticalSyncError): string {
  const dashboardUrl = `${APP_URL}/admin/inventory-sync`;
  const partnersUrl = `${APP_URL}/admin/partners`;

  let text = `
OCC INVENTORY SYNC ALERT
========================

Error Type: ${getErrorTypeDescription(error)}
Partner: ${formatShopName(error.partnerShop)}
Time: ${new Date().toLocaleString()}
`;

  if (error.consecutiveFailures) {
    text += `Consecutive Failures: ${error.consecutiveFailures}\n`;
  }

  if (error.failureRate !== undefined) {
    text += `Failure Rate: ${Math.round(error.failureRate * 100)}%\n`;
  }

  text += `
MESSAGE
-------
${error.message}
`;

  if (error.details) {
    text += `
ERROR DETAILS
-------------
${error.details}
`;
  }

  text += `
RECOMMENDED ACTION
------------------
${getRecommendedAction(error)}

LINKS
-----
Sync Dashboard: ${dashboardUrl}
Partners: ${partnersUrl}

---
This is an automated alert from OCC Inventory Hub.
  `.trim();

  return text;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
