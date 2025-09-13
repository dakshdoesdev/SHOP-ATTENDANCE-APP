// Minimal static file server for Deno Deploy
// Serves the built React app from client/dist with SPA fallback.
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

// Serve the built Vite client output. Our Vite config builds to "dist/public".
const fsRoot = "dist/public";

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // This deployment hosts only the frontend. All API/WS calls should go to your API_BASE (ngrok or fixed URL).
  if (url.pathname.startsWith("/api") || url.pathname === "/ws") {
    return new Response("API not available on this host. Configure API_BASE.", { status: 501 });
  }

  // Try serving static asset directly first
  const res = await serveDir(req, { fsRoot, quiet: true });
  if (res.status !== 404) return res;

  // SPA fallback to index.html
  try {
    const index = await Deno.readFile(`${fsRoot}/index.html`);
    return new Response(index, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("index.html not found. Build the client first.", { status: 500 });
  }
});
