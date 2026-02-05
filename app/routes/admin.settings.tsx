import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useNavigation, Form } from "react-router";
import toast from "react-hot-toast";
import { requireAdminSession } from "~/lib/supabase.server";
import { sendAlertEmail, isEmailConfigured } from "~/lib/email/email.server";
import { buildSyncFailureEmail } from "~/lib/email/templates.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { colors } from "~/lib/tokens";
import type { CriticalSyncError } from "~/types/database";

interface LoaderData {
  emailConfigured: boolean;
}

interface ActionData {
  success: boolean;
  intent: string;
  error?: string;
}

export const loader = async (_args: LoaderFunctionArgs) => {
  return {
    emailConfigured: isEmailConfigured(),
  } satisfies LoaderData;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdminSession(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "test_alert") {
    try {
      // Create a test critical error
      const testError: CriticalSyncError = {
        type: "consecutive_failures",
        partnerShop: "test-partner.myshopify.com",
        message: "This is a TEST of the OCC Inventory Hub alert system. No action is required.",
        details: "If you received this email, your alert configuration is working correctly.",
        consecutiveFailures: 3,
      };

      const { subject, html, text } = buildSyncFailureEmail(testError);
      // Prepend [TEST] to subject to make it clear
      const testSubject = subject.replace("[OCC Alert]", "[OCC Alert - TEST]");
      const result = await sendAlertEmail({ subject: testSubject, html, text });

      if (result.success) {
        return { success: true, intent } satisfies ActionData;
      }

      return {
        success: false,
        intent,
        error: result.error || "Failed to send test alert",
      } satisfies ActionData;
    } catch (err) {
      return {
        success: false,
        intent,
        error: err instanceof Error ? err.message : "Unexpected error sending test alert",
      } satisfies ActionData;
    }
  }

  return { success: false, intent: intent || "unknown", error: "Unknown action" } satisfies ActionData;
};

export default function SettingsPage() {
  const { emailConfigured } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();

  const testAlertFormRef = useRef<HTMLFormElement>(null);
  const [showTestAlertModal, setShowTestAlertModal] = useState(false);

  const isSubmitting = navigation.state === "submitting";
  const submittingIntent = isSubmitting ? navigation.formData?.get("intent") : null;
  const isSendingTestAlert = submittingIntent === "test_alert";

  const prevNavigationState = useRef(navigation.state);
  const hasShownToast = useRef(false);

  // Close modals when submission completes
  useEffect(() => {
    if (prevNavigationState.current === "submitting" && navigation.state === "idle") {
      setShowTestAlertModal(false);
    }
    prevNavigationState.current = navigation.state;
  }, [navigation.state]);

  // Show toast when actionData changes
  useEffect(() => {
    if (actionData && !hasShownToast.current) {
      if (actionData.intent === "test_alert") {
        if (actionData.success) {
          toast.success("Test alert email sent! Check your inbox.");
        } else if (actionData.error) {
          toast.error(`Failed to send test alert: ${actionData.error}`);
        }
      }
      hasShownToast.current = true;
    }
  }, [actionData]);

  // Reset toast flag when starting a new submission
  useEffect(() => {
    if (navigation.state === "submitting") {
      hasShownToast.current = false;
    }
  }, [navigation.state]);

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1.5rem" }}>Settings</h1>

      {/* Email Alerts Section */}
      <div
        style={{
          backgroundColor: colors.background.card,
          padding: "1.5rem",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Email Alerts</h2>

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: emailConfigured ? colors.success.default : colors.error.default,
              }}
            />
            <span style={{ fontWeight: 500 }}>
              {emailConfigured ? "Configured" : "Not Configured"}
            </span>
          </div>
          <p style={{ fontSize: "0.875rem", color: colors.text.muted, margin: 0 }}>
            {emailConfigured
              ? "Email alerts are enabled. You'll receive notifications for critical sync failures including token revocations, unreachable stores, and high failure rates."
              : "Email alerts are not configured. Set the following environment variables to enable:"}
          </p>
          {!emailConfigured && (
            <ul style={{ fontSize: "0.875rem", color: colors.text.muted, marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
              <li><code>RESEND_API_KEY</code> - Your Resend API key</li>
              <li><code>ALERT_EMAIL_TO</code> - Recipient email(s), comma-separated</li>
              <li><code>ALERT_EMAIL_FROM</code> - Sender email (must be from verified domain)</li>
            </ul>
          )}
        </div>

        {emailConfigured && (
          <div
            style={{
              backgroundColor: colors.background.subtle,
              padding: "1rem",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Test Alert System</div>
              <div style={{ fontSize: "0.8125rem", color: colors.text.muted }}>
                Send a test email to verify your alert configuration is working.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTestAlertModal(true)}
              disabled={isSendingTestAlert}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: colors.primary.default,
                color: colors.text.inverse,
                border: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: isSendingTestAlert ? "not-allowed" : "pointer",
                opacity: isSendingTestAlert ? 0.7 : 1,
              }}
            >
              {isSendingTestAlert ? "Sending..." : "Send Test Email"}
            </button>
          </div>
        )}
      </div>

      {/* Hidden form for test alert */}
      <Form method="post" ref={testAlertFormRef} style={{ display: "none" }}>
        <input type="hidden" name="intent" value="test_alert" />
      </Form>

      {/* Test Alert Confirmation Modal */}
      <ConfirmModal
        isOpen={showTestAlertModal}
        title="Send Test Alert?"
        message="This will send a test email to verify your alert system is configured correctly. The email will be clearly marked as a test."
        confirmLabel="Send Test Email"
        cancelLabel="Cancel"
        onConfirm={() => testAlertFormRef.current?.submit()}
        onCancel={() => setShowTestAlertModal(false)}
        isLoading={isSendingTestAlert}
      />
    </div>
  );
}
