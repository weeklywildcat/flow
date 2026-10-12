import adminApp from "./admin";

const MANAGE_PATH = "/library/manage";
const KIOSK_PATH = "/library/kiosk";
const MANAGE_API_PATTERN = /^[a-z0-9-]+$/;
// Vite fingerprints everything here, so it can be cached for good. It sits outside the
// Access-protected /library/manage path because the kiosk loads the same shared chunks.
const SHARED_ASSET_PREFIX = "/library/assets/";
const PUBLIC_FILES = new Set(["/library/favicon.svg"]);

// The dashboard and kiosk are static React bundles, so scripts never need to be inline.
const PAGE_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePath(url.pathname);

    if (pathname === MANAGE_PATH) {
      const apiName = url.searchParams.get("api");

      if (apiName !== null) {
        if (!MANAGE_API_PATTERN.test(apiName)) {
          return new Response(JSON.stringify({ error: "Invalid API route." }), {
            status: 400,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }

        const target = new URL(request.url);
        target.pathname = `/api/library/${apiName}`;
        target.search = "";
        for (const [key, value] of url.searchParams) {
          if (key !== "api") target.searchParams.append(key, value);
        }

        const rewrittenRequest = new Request(target.toString(), request);
        return adminApp.fetch(rewrittenRequest, env, ctx);
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response(JSON.stringify({ error: "Method not allowed.", allowedMethods: ["GET"] }), {
          status: 405,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }

      return servePageAsset(env, request, `${MANAGE_PATH}/index.html`, "no-store");
    }

    const readable = request.method === "GET" || request.method === "HEAD";
    if (pathname === KIOSK_PATH && readable) {
      return servePageAsset(env, request, `${KIOSK_PATH}/index.html`, "no-store");
    }
    if (url.pathname.startsWith(SHARED_ASSET_PREFIX) && readable) {
      return servePageAsset(env, request, url.pathname, "public, max-age=31536000, immutable");
    }
    if (PUBLIC_FILES.has(url.pathname) && readable) {
      return servePageAsset(env, request, url.pathname, "no-cache");
    }

    return adminApp.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function servePageAsset(env: Env, request: Request, assetPath: string, cacheControl: string): Promise<Response> {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = "";
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: request.method, headers: request.headers }));

  if (asset.status === 404) {
    const missing = assetPath.endsWith("index.html")
      ? "This page has not been built. Run npm run build before deploying."
      : "Not found.";
    return new Response(missing, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...PAGE_SECURITY_HEADERS } });
  }

  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(PAGE_SECURITY_HEADERS)) headers.set(name, value);
  if (asset.ok) headers.set("Cache-Control", cacheControl);
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
