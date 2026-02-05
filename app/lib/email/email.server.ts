/**
 * Email Service using Resend
 *
 * Provides email sending functionality for alert notifications.
 * Gracefully degrades if Resend API key is not configured.
 */

import { Resend } from "resend";

// Environment variables for email configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || "OCC Inventory Hub <noreply@resend.dev>";

// Singleton Resend client
let resendClient: Resend | null = null;

/**
 * Get or create the Resend client singleton
 * Returns null if API key is not configured
 */
function getResendClient(): Resend | null {
  if (!RESEND_API_KEY) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }

  return resendClient;
}

/**
 * Check if email sending is configured
 */
export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && ALERT_EMAIL_TO);
}

export interface SendAlertEmailOptions {
  subject: string;
  html: string;
  text: string;
  to?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Parse comma-separated email addresses into an array
 */
function parseEmailAddresses(addresses: string): string[] {
  return addresses
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

/**
 * Send an alert email
 *
 * @param options - Email options (subject, html, text, optional to address)
 * @returns Result with success status and optional message ID or error
 */
export async function sendAlertEmail(
  options: SendAlertEmailOptions
): Promise<SendEmailResult> {
  const client = getResendClient();

  if (!client) {
    console.warn("[email] Resend API key not configured - email not sent");
    return {
      success: false,
      error: "Email service not configured (missing RESEND_API_KEY)",
    };
  }

  const toAddressString = options.to || ALERT_EMAIL_TO;
  if (!toAddressString) {
    console.warn("[email] No recipient address configured - email not sent");
    return {
      success: false,
      error: "No recipient address configured (missing ALERT_EMAIL_TO)",
    };
  }

  // Parse comma-separated email addresses
  const toAddresses = parseEmailAddresses(toAddressString);
  if (toAddresses.length === 0) {
    return {
      success: false,
      error: "No valid email addresses found in ALERT_EMAIL_TO",
    };
  }

  try {
    const { data, error } = await client.emails.send({
      from: ALERT_EMAIL_FROM,
      to: toAddresses,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error("[email] Failed to send alert email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`[email] Alert email sent successfully: ${data?.id}`);
    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[email] Exception sending alert email:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
