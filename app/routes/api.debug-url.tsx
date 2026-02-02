import { generateInstallUrl } from "~/lib/partners/oauth.server";

export const loader = async () => {
  const testUrl = generateInstallUrl(
    "test-store.myshopify.com",
    "https://example.com/callback"
  );

  return Response.json({
    generatedUrl: testUrl,
    envCheck: {
      hasApiKey: !!process.env.SHOPIFY_API_KEY,
      apiKeyPrefix: process.env.SHOPIFY_API_KEY?.substring(0, 8),
    },
  });
};
