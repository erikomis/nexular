import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { createGzip, createBrotliCompress } from "node:zlib";
import { invokeRouteAction, renderDocument } from "./renderer";
import type { RenderedDocument } from "./renderer";
import { container, AuthService } from "../app/core";
import { loadRuntimeConfig } from "./runtime-config";
import { getRateLimiter } from "./rate-limiter";
import { createRouteContext, resolveApiRoute } from "./file-router";

export const app = express();
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();
const devClients = new Set<express.Response>();
let devWatcherStarted = false;

type DevEvent =
  | { type: "reload"; reason: string }
  | { type: "error"; message: string; details?: string };

function emitDevEvent(event: DevEvent): void {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  devClients.forEach((client) => {
    client.write(payload);
  });
}

function setupDevWatcher(): void {
  if (devWatcherStarted || isProduction()) {
    return;
  }

  devWatcherStarted = true;

  const roots = [path.join(process.cwd(), "src"), path.join(process.cwd(), "dist")];

  roots.forEach((root) => {
    if (!fs.existsSync(root)) {
      return;
    }

    try {
      fs.watch(
        root,
        {
          recursive: true,
        },
        (_eventType, filename) => {
          emitDevEvent({
            type: "reload",
            reason: filename ? `changed:${filename}` : "changed",
          });
        }
      );
    } catch {
      // Best-effort watcher for local development only.
    }
  });
}

function buildDevClientScript(): string {
  return [
    "<script>",
    "(() => {",
    "  if (typeof window === 'undefined') return;",
    "  const source = new EventSource('/_nexular/dev/events');",
    "  let overlay = null;",
    "  const ensureOverlay = () => {",
    "    if (overlay) return overlay;",
    "    overlay = document.createElement('div');",
    "    overlay.id = '__nexular_dev_overlay__';",
    "    overlay.style.position = 'fixed';",
    "    overlay.style.inset = '0';",
    "    overlay.style.zIndex = '99999';",
    "    overlay.style.background = 'rgba(17, 24, 39, 0.96)';",
    "    overlay.style.color = '#f8fafc';",
    "    overlay.style.padding = '20px';",
    "    overlay.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';",
    "    overlay.style.whiteSpace = 'pre-wrap';",
    "    overlay.style.overflow = 'auto';",
    "    overlay.style.display = 'none';",
    "    document.body.appendChild(overlay);",
    "    return overlay;",
    "  };",
    "  source.addEventListener('reload', () => { window.location.reload(); });",
    "  source.addEventListener('error', (event) => {",
    "    const box = ensureOverlay();",
    "    try {",
    "      const payload = JSON.parse(event.data);",
    "      box.textContent = '[Nexular Dev Error]\\n\\n' + (payload.message || 'Erro desconhecido') + (payload.details ? '\\n\\n' + payload.details : '');",
    "    } catch {",
    "      box.textContent = '[Nexular Dev Error]\\n\\nFalha ao parsear payload de erro.';",
    "    }",
    "    box.style.display = 'block';",
    "  });",
    "})();",
    "</script>",
  ].join("");
}

function compressionMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  // Keep API payloads uncompressed to avoid JSON corruption and preserve predictable responses.
  if (
    req.path.startsWith("/_nexular/") ||
    req.path.startsWith("/api/") ||
    req.path.startsWith("/client/") ||
    req.path.startsWith("/assets/")
  ) {
    next();
    return;
  }

  const ae = String(req.headers["accept-encoding"] ?? "");
  const usesBr = ae.includes("br");
  const usesGzip = ae.includes("gzip");

  if (!usesBr && !usesGzip) {
    next();
    return;
  }

  const encoding = usesBr ? "br" : "gzip";
  const compressor = usesBr ? createBrotliCompress() : createGzip();

  res.setHeader("Content-Encoding", encoding);
  res.setHeader("Vary", "Accept-Encoding");
  res.removeHeader("Content-Length");

  const _write = res.write.bind(res) as (chunk: Buffer) => boolean;
  const _end = res.end.bind(res) as () => express.Response;

  compressor.on("data", (chunk: Buffer) => _write(chunk));
  compressor.on("end", () => _end());

  (res as unknown as { write: (c: unknown) => boolean }).write = (chunk: unknown) =>
    compressor.write(chunk as Buffer);

  (res as unknown as { end: (c?: unknown) => express.Response }).end = (chunk?: unknown) => {
    if (chunk !== undefined) compressor.write(chunk as Buffer);
    compressor.end();
    return res;
  };

  next();
}

function validateOrigin(req: express.Request): boolean {
  const origin = String(req.headers.origin ?? "");
  if (!origin) {
    return true;
  }

  const config = loadRuntimeConfig();
  const allowedOrigins = config.security?.corsAllowList || [];
  if (allowedOrigins.length > 0) {
    return allowedOrigins.includes(origin);
  }

  const host = String(req.headers.host ?? "");
  return origin.endsWith(host);
}

function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function validateCSRFToken(token: string): boolean {
  const stored = csrfTokens.get(token);
  if (!stored || stored.expiresAt < Date.now()) {
    return false;
  }
  csrfTokens.delete(token);
  return true;
}

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "development") === "production";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function resolveAssetRoots(): string[] {
  const appRoot = process.env.NEXULAR_APP_ROOT
    ? path.resolve(process.env.NEXULAR_APP_ROOT)
    : process.cwd();

  const candidates = [
    path.join(appRoot, "app/assets"),
    path.join(appRoot, "src/assets"),
    path.join(__dirname, "../app/assets"),
    path.join(__dirname, "../src/assets"),
  ];

  return candidates.filter((dir, index) => fs.existsSync(dir) && candidates.indexOf(dir) === index);
}

function resolveClientRoots(): string[] {
  const appRoot = process.env.NEXULAR_APP_ROOT
    ? path.resolve(process.env.NEXULAR_APP_ROOT)
    : process.cwd();

  const candidates = [
    path.join(appRoot, "app/client"),
    path.join(appRoot, "client"),
    path.join(__dirname, "../client"),
  ];

  return candidates.filter((dir, index) => fs.existsSync(dir) && candidates.indexOf(dir) === index);
}

app.use(compressionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

for (const clientDir of resolveClientRoots()) {
  app.use("/client", express.static(clientDir));
}

for (const assetsDir of resolveAssetRoots()) {
  app.use("/assets", express.static(assetsDir));
}

if (!isProduction()) {
  setupDevWatcher();

  app.get("/_nexular/dev/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(": connected\n\n");
    devClients.add(res);

    req.on("close", () => {
      devClients.delete(res);
    });
  });
}

app.get("/_nexular/csrf-token", (_req, res) => {
  const token = generateCSRFToken();
  csrfTokens.set(token, { token, expiresAt: Date.now() + 3_600_000 });
  res.status(200).json({ ok: true, token });
});

app.get("/_nexular/observability/auth", (req, res) => {
  const config = loadRuntimeConfig();
  const apiSecret = config.security?.observabilityToken || process.env.NEXULAR_OBSERVABILITY_TOKEN;

  if (!apiSecret) {
    res.status(403).json({ ok: false, error: "Observability token required" });
    return;
  }

  const token = req.headers["x-observability-token"] || req.query.token;
  if (token !== apiSecret) {
    res.status(401).json({ ok: false, error: "Invalid observability token" });
    return;
  }

  const auth = container.resolve<AuthService>(AuthService);
  res.status(200).json({
    ok: true,
    metrics: auth.getMetrics(),
  });
});

app.get("/_nexular/hydration/info", (_req, res) => {
  res.status(200).json({
    ok: true,
    hydration: {
      supported: true,
      features: {
        progressive: true,
        metrics: true,
        analytics: true,
      },
      endpoints: {
        metrics: "/_nexular/hydration/metrics",
        islands: "/_nexular/hydration/islands",
      },
    },
  });
});

app.post("/_nexular/action", async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    if (await getRateLimiter().shouldLimit(ip, 120, 60_000)) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    if (!validateOrigin(req)) {
      res.status(403).json({ ok: false, error: "CORS validation failed" });
      return;
    }

    const csrfToken = req.headers["x-csrf-token"] as string | undefined;
    if (!csrfToken || !validateCSRFToken(csrfToken)) {
      res.status(403).json({ ok: false, error: "CSRF token invalid or missing" });
      return;
    }

    const { path: pathname, action, input, locale } = req.body ?? {};

    if (!pathname || !action) {
      res.status(400).json({
        ok: false,
        error: "path and action are required",
      });
      return;
    }

    const result = await invokeRouteAction({
      pathname,
      action,
      input,
      locale: locale ?? "pt",
      request: {
        ip,
        headers: {
          authorization: req.headers.authorization,
          "x-api-key":
            typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined,
          "x-internal-token":
            typeof req.headers["x-internal-token"] === "string"
              ? req.headers["x-internal-token"]
              : undefined,
          origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
          host: typeof req.headers.host === "string" ? req.headers.host : undefined,
        },
      },
    });

    res.status(200).json({ ok: true, result });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown action error",
    });
  }
});

// ---------------------------------------------------------------------------
// API routes — handle api.ts files before SSR catch-all
// ---------------------------------------------------------------------------
const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

app.all("*", async (req, res, next) => {
  // Only intercept paths that have a matching api.ts file
  const routesDir = process.env.NEXULAR_APP_ROOT
    ? path.resolve(process.env.NEXULAR_APP_ROOT, "app/routes")
    : path.join(__dirname, "../app/routes");

  const apiRoute = await resolveApiRoute(req.path, routesDir).catch(() => null);
  if (!apiRoute) return next();

  const method = req.method.toUpperCase() as (typeof API_METHODS)[number];
  const handler = apiRoute.module[method];

  if (!handler) {
    const allowed = API_METHODS.filter((m) => typeof apiRoute.module[m] === "function").join(", ");
    res.setHeader("Allow", allowed);
    res.status(405).json({ ok: false, error: `Method ${method} not allowed` });
    return;
  }

  const rawQuery = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const ctx = createRouteContext(req.path, "pt", rawQuery, apiRoute.params, {
    ip: req.ip,
    method: req.method,
    body: req.body,
    headers: {
      authorization: req.headers.authorization,
      "x-api-key":
        typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined,
    },
  });

  try {
    const result = await handler(ctx);
    res.status(200).json({ ok: true, data: result });
  } catch (error) {
    const candidateStatus =
      typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : typeof (error as { status?: unknown })?.status === "number"
          ? (error as { status: number }).status
          : undefined;

    const status =
      typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus <= 599
        ? candidateStatus
        : 500;

    res
      .status(status)
      .json({ ok: false, error: error instanceof Error ? error.message : "Internal error" });
  }
});

app.get("*", async (req, res) => {
  const acceptLanguage = req.headers["accept-language"] ?? "";
  const locale = String(acceptLanguage).toLowerCase().startsWith("en") ? "en" : "pt";
  const rawQuery = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  let rendered: RenderedDocument;

  try {
    rendered = await renderDocument(req.path, locale, rawQuery, {
      ip: req.ip,
      headers: {
        authorization: req.headers.authorization,
        "x-api-key":
          typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : undefined,
        "x-internal-token":
          typeof req.headers["x-internal-token"] === "string"
            ? req.headers["x-internal-token"]
            : undefined,
        origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
        host: typeof req.headers.host === "string" ? req.headers.host : undefined,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown rendering error";
    const stack = error instanceof Error ? error.stack : undefined;

    if (!isProduction()) {
      emitDevEvent({
        type: "error",
        message: `SSR request failed at ${req.path}`,
        details: [message, stack].filter(Boolean).join("\n\n"),
      });
    }

    rendered = {
      status: 500,
      revalidate: 0,
      head: `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>500 — Erro interno</title></head><body>`,
      body: `<app-root><section data-nx-error-boundary="default"><h1>Erro interno</h1><p>${escapeHtml(message)}</p>${
        !isProduction() && stack
          ? `<details style="margin-top:12px"><summary>Detalhes tecnicos</summary><pre style="white-space:pre-wrap;line-height:1.4;margin-top:8px">${escapeHtml(stack)}</pre></details>`
          : ""
      }</section></app-root>`,
      tail: "</body></html>",
      diagnostics: {
        message,
        stack: !isProduction() ? stack : undefined,
        path: req.path,
      },
    };
  }

  if (!isProduction() && rendered.status >= 500) {
    const diagnostics = rendered.diagnostics;
    const details = diagnostics
      ? [`Path: ${diagnostics.path}`, `Message: ${diagnostics.message}`, diagnostics.stack]
          .filter(Boolean)
          .join("\n\n")
      : "Check terminal logs for stack trace.";

    emitDevEvent({
      type: "error",
      message: `SSR request failed at ${req.path}`,
      details,
    });
  }

  res.status(rendered.status);
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isProduction()) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'"
    );
  }

  if (rendered.headers?.location) {
    res.setHeader("Location", rendered.headers.location);
    res.end();
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (rendered.revalidate > 0) {
    res.setHeader(
      "Cache-Control",
      `public, max-age=0, s-maxage=${rendered.revalidate}, stale-while-revalidate=${Math.max(rendered.revalidate, 30)}`
    );
  }

  res.write(rendered.head);
  res.write(rendered.body);
  if (!isProduction()) {
    res.write(buildDevClientScript());
  }
  res.end(rendered.tail);
});

export function startServer(port = 3000): void {
  app.listen(port, () => {
    console.log(`Nexular SSR listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  const envPort = Number(process.env.PORT ?? "3000");
  const port = Number.isFinite(envPort) && envPort > 0 ? envPort : 3000;
  startServer(port);
}
