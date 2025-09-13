import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { setupVite, serveStatic, log } from "./vite";
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
// DB readiness is optional in memory mode. Import lazily if configured.

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Always trust proxy (ngrok/Heroku/etc.) so req.secure reflects X-Forwarded-Proto
app.set("trust proxy", 1);

// CORS: reflect only allowed origins and allow credentials
const allowList = new Set<string>([
  process.env.CORS_ORIGIN || "",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
].filter(Boolean));

const dynamicCorsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  if (!origin) return callback(null, true); // non-CORS request
  try {
    const o = new URL(origin);
    const host = o.hostname;
    // Explicit allowlist or common dev hosts
    if (allowList.has(origin)) return callback(null, true);
    // Allow common tunnel domains
    if (host.endsWith('.ngrok-free.app')) return callback(null, true);
    if (host.endsWith('.loca.lt')) return callback(null, true); // localtunnel
    if (host.endsWith('.trycloudflare.com')) return callback(null, true); // cloudflared quick tunnel
    if (host.endsWith('.deno.dev')) return callback(null, true); // Deno Deploy (legacy)
    if (host.endsWith('.deno.net')) return callback(null, true); // Deno Deploy (new domains)
    // Allow typical LAN hosts
    if (/^(10\.|192\.168\.|172\.)/.test(host)) return callback(null, true);
  } catch {}
  return callback(null, false);
};

app.use(cors({ origin: dynamicCorsOrigin, credentials: true }));

// Ensure CORS headers are present on all responses for allowed origins
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// Handle preflight for all routes
app.options("*", cors({ credentials: true, origin: dynamicCorsOrigin }));

// Defensive preflight handler to ensure CORS headers are present even if other middleware short-circuits
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // non-CORS request
  try {
    const o = new URL(origin);
    const host = o.hostname;
    if (allowList.has(origin)) return true;
    if (host.endsWith('.ngrok-free.app')) return true;
    if (host.endsWith('.loca.lt')) return true;
    if (host.endsWith('.trycloudflare.com')) return true;
    if (host.endsWith('.deno.dev')) return true;
    if (host.endsWith('.deno.net')) return true;
    if (/^(10\.|192\.168\.|172\.)/.test(host)) return true;
  } catch {}
  return false;
}

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin as string | undefined;
    if (isAllowedOrigin(origin)) {
      if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
      }
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', (req.headers['access-control-request-method'] as string) || 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', (req.headers['access-control-request-headers'] as string) || 'Content-Type, Authorization, X-Requested-With, X-Device-Id');
      return res.sendStatus(204);
    }
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Create HTTP or HTTPS server depending on env
  let server: http.Server | https.Server;
  const certPath = process.env.TLS_CERT_FILE;
  const keyPath = process.env.TLS_KEY_FILE;
  if (certPath && keyPath) {
    try {
      const cert = fs.readFileSync(path.resolve(certPath));
      const key = fs.readFileSync(path.resolve(keyPath));
      server = https.createServer({ key, cert }, app);
      log(`HTTPS enabled (cert: ${certPath})`);
    } catch (e) {
      log(`failed to enable HTTPS, falling back to HTTP: ${(e as Error)?.message || e}`);
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
  }

  // Setup authentication FIRST
  const sessionMiddleware = setupAuth(app);
  
  // Register API routes AFTER auth setup (attach WS to same HTTP server)
  // If a DATABASE_URL is configured, try waking the DB before wiring routes
  if (process.env.DATABASE_URL) {
    try {
      const { ensureDbReady } = await import("./db");
      await ensureDbReady();
    } catch (err) {
      log(`database not ready at startup, continuing: ${(err as Error)?.message || err}`);
    }
  }
  registerRoutes(app, server);

  if (app.get("env") === "development") {
    await setupVite(app, server, sessionMiddleware);
  } else {
    serveStatic(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    const protocol = server instanceof https.Server ? 'https' : 'http';
    log(`serving on ${protocol}://0.0.0.0:${port}`);
  });
})();
