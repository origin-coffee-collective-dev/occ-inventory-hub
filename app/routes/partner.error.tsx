import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

const ERROR_MESSAGES: Record<string, { title: string; message: string }> = {
  missing_shop: {
    title: "Missing Shop Parameter",
    message: "The shop parameter is required. Please use a valid install link.",
  },
  invalid_shop: {
    title: "Invalid Shop Domain",
    message: "The shop domain provided is not valid. Please check the URL and try again.",
  },
  config_error: {
    title: "Configuration Error",
    message: "The app is not properly configured. Please contact support.",
  },
  missing_params: {
    title: "Missing Parameters",
    message: "The authorization response is missing required parameters.",
  },
  invalid_hmac: {
    title: "Security Validation Failed",
    message: "The request signature could not be verified. Please try the authorization again.",
  },
  invalid_state: {
    title: "Session Expired",
    message: "Your authorization session has expired. Please start the process again.",
  },
  token_exchange: {
    title: "Authorization Failed",
    message: "Failed to complete the authorization with Shopify. Please try again.",
  },
  database_error: {
    title: "Storage Error",
    message: "Failed to save your authorization. Please try again or contact support.",
  },
  default: {
    title: "Authorization Error",
    message: "An unexpected error occurred during authorization. Please try again.",
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") || "default";
  const details = url.searchParams.get("details");

  const errorInfo = ERROR_MESSAGES[reason] || ERROR_MESSAGES.default;

  return { ...errorInfo, details };
};

export default function PartnerError() {
  const { title, message, details } = useLoaderData<typeof loader>();

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.icon}>&#10007;</div>
        <h1 style={styles.heading}>{title}</h1>
        <p style={styles.text}>{message}</p>
        {details && <p style={styles.details}>{details}</p>}
        <p style={styles.subtext}>
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "1rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#f4f6f8",
  },
  content: {
    textAlign: "center",
    maxWidth: "500px",
    padding: "2rem",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  icon: {
    fontSize: "4rem",
    color: "#d72c0d",
    marginBottom: "1rem",
  },
  heading: {
    margin: "0 0 1rem 0",
    fontSize: "1.5rem",
    color: "#202223",
  },
  text: {
    margin: "0 0 1rem 0",
    fontSize: "1rem",
    color: "#6d7175",
  },
  details: {
    margin: "0 0 1rem 0",
    fontSize: "0.875rem",
    color: "#8c9196",
    fontStyle: "italic",
    padding: "0.5rem",
    backgroundColor: "#f6f6f7",
    borderRadius: "4px",
  },
  subtext: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#8c9196",
  },
};
