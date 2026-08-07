import adminApp from "./admin";

const MANAGE_PATH = "/library/manage";
const MANAGE_API_PATTERN = /^[a-z0-9-]+$/;

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

        // Keep the original Cloudflare Access headers while routing the request
        // internally to the API handler. This allows Access to protect only the
        // librarian-facing /library/manage path instead of exposing a second
        // browser-facing authentication surface under /api/library/*.
        const rewrittenRequest = new Request(target.toString(), request);
        return adminApp.fetch(rewrittenRequest, env, ctx);
      }

      const response = await adminApp.fetch(request, env, ctx);
      const contentType = response.headers.get("Content-Type") ?? "";
      if (request.method !== "GET" || !response.ok || !contentType.includes("text/html")) {
        return response;
      }

      const markup = await response.text();
      const accessSafeMarkup = markup
        .replace(/\/api\/library\/([a-z0-9-]+)\?/g, `${MANAGE_PATH}?api=$1&`)
        .replace(/\/api\/library\/([a-z0-9-]+)/g, `${MANAGE_PATH}?api=$1`);

      return new Response(accessSafeMarkup, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return adminApp.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx): Promise<void> {
    return adminApp.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;

function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
