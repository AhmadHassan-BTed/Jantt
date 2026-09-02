/**
 * Jantt CORS Proxy — Cloudflare Worker
 *
 * A tiny proxy that fetches publicly shared files from Google Drive
 * (and other providers) and returns them with proper CORS headers.
 *
 * Free forever on Cloudflare Workers free tier (100K requests/day).
 *
 * Deploy:  npx wrangler deploy (from the /worker directory)
 */

const ALLOWED_ORIGINS = [
  "https://ahmadhassan-bted.github.io",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing ?url= parameter" }),
        { status: 400, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }

    try {
      // Fetch the target URL server-side (no CORS restrictions here)
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Jantt-Sync/1.0",
          Accept: "application/json, text/plain, */*",
        },
        redirect: "follow",
      });

      // Read the body
      const body = await response.text();

      // Return with CORS headers
      return new Response(body, {
        status: response.status,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "X-Proxy-Status": String(response.status),
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy fetch failed", details: err.message }),
        { status: 502, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } }
      );
    }
  },
};
