import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "Your store";

  return { shop };
};

export default function PartnerSuccess() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.icon}>&#10003;</div>
        <h1 style={styles.heading}>Connected!</h1>
        <p style={styles.text}>
          <strong>{shop}</strong> is now connected to Origin Coffee Collective.
        </p>
        <p style={styles.subtext}>You can close this window.</p>
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
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#f4f6f8",
  },
  content: {
    textAlign: "center",
    maxWidth: "400px",
    padding: "3rem 2rem",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  icon: {
    fontSize: "4rem",
    color: "#008060",
    marginBottom: "1rem",
  },
  heading: {
    margin: "0 0 1rem 0",
    fontSize: "1.75rem",
    color: "#202223",
  },
  text: {
    margin: "0 0 1.5rem 0",
    fontSize: "1rem",
    color: "#6d7175",
    lineHeight: 1.5,
  },
  subtext: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#8c9196",
  },
};
