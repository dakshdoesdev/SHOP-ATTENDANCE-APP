import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { createServer } from "http";
import { setupVite, serveStatic, log } from "./vite";
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
    // Allow ngrok subdomains
    if (host.endsWith('.ngrok-free.app')) return callback(null, true);
    // Allow typical LAN hosts
    if (/^(10\.|192\.168\.|172\.)/.test(host)) return callback(null, true);
  } catch {}
  return callback(null, false);
};

app.use(cors({ origin: dynamicCorsOrigin, credentials: true }));

// Handle preflight for all routes
app.options("*", cors({ credentials: true, origin: dynamicCorsOrigin }));

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
  const server = createServer(app);

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
    log(`serving on port ${port}`);
  });
})();
