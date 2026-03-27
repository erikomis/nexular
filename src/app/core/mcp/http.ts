import http, { type IncomingMessage, type ServerResponse } from "node:http";
import {
  MCPService,
  type MCPJsonRpcRequest,
  type MCPJsonRpcResponse,
  type MCPNotification,
} from "./service";

type HttpTransportOptions = {
  host?: string;
  port?: number;
  path?: string;
  service?: MCPService;
  projectRoot?: string;
  logger?: (message: string) => void;
  auth?: {
    bearerToken?: string;
  };
  cors?: {
    enabled?: boolean;
    allowOrigins?: string[];
    allowMethods?: string[];
    allowHeaders?: string[];
    allowCredentials?: boolean;
  };
  security?: {
    rateLimit?: {
      enabled?: boolean;
      maxRequestsPerWindow?: number;
      windowMs?: number;
    };
    quotas?: {
      maxSSEClients?: number;
      maxRequestBodyBytes?: number;
    };
    audit?: {
      enabled?: boolean;
      includeHeaders?: boolean;
    };
  };
};

type HttpClient = {
  id: number;
  response: ServerResponse;
};

type HttpTransportHandle = {
  server: http.Server;
  stop: () => Promise<void>;
  address: () => ReturnType<http.Server["address"]>;
};

type CorsConfig = {
  enabled: boolean;
  allowOrigins: string[];
  allowMethods: string[];
  allowHeaders: string[];
  allowCredentials: boolean;
};

type HardeningConfig = {
  rateLimit: {
    enabled: boolean;
    maxRequestsPerWindow: number;
    windowMs: number;
  };
  quotas: {
    maxSSEClients: number;
    maxRequestBodyBytes: number;
  };
  audit: {
    enabled: boolean;
    includeHeaders: boolean;
  };
};

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string
): MCPJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let settled = false;

  await new Promise<void>((resolve, reject) => {
    const finishReject = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const finishResolve = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    request.on("data", (chunk) => {
      if (settled) {
        return;
      }

      const buffer = Buffer.from(chunk);
      totalBytes += buffer.byteLength;

      if (totalBytes > maxBytes) {
        finishReject(new PayloadTooLargeError("Request payload too large"));
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", finishResolve);
    request.on("error", (error) =>
      finishReject(error instanceof Error ? error : new Error("Body read error"))
    );
  });

  if (chunks.length === 0) {
    return null;
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function isJsonRpcRequest(value: unknown): value is MCPJsonRpcRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === "2.0" && typeof candidate.method === "string";
}

function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function broadcastNotification(clients: Set<HttpClient>, notification: MCPNotification): void {
  const body = `event: ${notification.method}\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: notification.method })}\n\n`;
  clients.forEach((client) => {
    client.response.write(body);
  });
}

function normalizeCorsConfig(options?: HttpTransportOptions["cors"]): CorsConfig {
  return {
    enabled: options?.enabled ?? false,
    allowOrigins: options?.allowOrigins ?? ["*"],
    allowMethods: options?.allowMethods ?? ["GET", "POST", "OPTIONS"],
    allowHeaders: options?.allowHeaders ?? ["Content-Type", "Authorization"],
    allowCredentials: options?.allowCredentials ?? false,
  };
}

function isOriginAllowed(origin: string, allowOrigins: string[]): boolean {
  if (allowOrigins.includes("*")) {
    return true;
  }

  return allowOrigins.includes(origin);
}

function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  cors: CorsConfig
): boolean {
  if (!cors.enabled) {
    return true;
  }

  const origin = String(request.headers.origin ?? "");
  if (!origin) {
    response.setHeader("Vary", "Origin");
    return true;
  }

  if (!isOriginAllowed(origin, cors.allowOrigins)) {
    return false;
  }

  response.setHeader("Access-Control-Allow-Origin", cors.allowOrigins.includes("*") ? "*" : origin);
  response.setHeader("Access-Control-Allow-Methods", cors.allowMethods.join(", "));
  response.setHeader("Access-Control-Allow-Headers", cors.allowHeaders.join(", "));
  response.setHeader("Vary", "Origin");

  if (cors.allowCredentials) {
    response.setHeader("Access-Control-Allow-Credentials", "true");
  }

  return true;
}

function isAuthorized(request: IncomingMessage, token?: string): boolean {
  if (!token) {
    return true;
  }

  const rawAuth = request.headers.authorization;
  if (!rawAuth || typeof rawAuth !== "string") {
    return false;
  }

  const expected = `Bearer ${token}`;
  return rawAuth.trim() === expected;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value || !value.trim()) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeHardeningConfig(options?: HttpTransportOptions["security"]): HardeningConfig {
  return {
    rateLimit: {
      enabled: options?.rateLimit?.enabled ?? false,
      maxRequestsPerWindow: options?.rateLimit?.maxRequestsPerWindow ?? 120,
      windowMs: options?.rateLimit?.windowMs ?? 60_000,
    },
    quotas: {
      maxSSEClients: options?.quotas?.maxSSEClients ?? 250,
      maxRequestBodyBytes: options?.quotas?.maxRequestBodyBytes ?? 1_048_576,
    },
    audit: {
      enabled: options?.audit?.enabled ?? false,
      includeHeaders: options?.audit?.includeHeaders ?? false,
    },
  };
}

function resolveClientAddress(request: IncomingMessage): string {
  const socketAddress = request.socket.remoteAddress;
  return socketAddress && socketAddress.trim() ? socketAddress.trim() : "unknown";
}

function shouldRateLimit(
  windows: Map<string, RateLimitWindow>,
  key: string,
  now: number,
  maxRequestsPerWindow: number,
  windowMs: number
): boolean {
  const existing = windows.get(key);

  if (!existing || now >= existing.resetAt) {
    windows.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return false;
  }

  existing.count += 1;
  if (existing.count > maxRequestsPerWindow) {
    return true;
  }

  windows.set(key, existing);
  return false;
}

export function startMCPHttpServer(
  options: HttpTransportOptions = {}
): Promise<HttpTransportHandle> {
  const service = options.service ?? new MCPService();
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3334;
  const mcpPath = options.path ?? "/mcp";
  const projectRoot = options.projectRoot ?? process.cwd();
  const logger = options.logger ?? (() => undefined);
  const startedAt = Date.now();
  const bearerToken = options.auth?.bearerToken;
  const cors = normalizeCorsConfig(options.cors);
  const hardening = normalizeHardeningConfig(options.security);

  const streamPath = `${mcpPath}/events`;
  let sequence = 0;
  const clients = new Set<HttpClient>();
  const rateLimitWindows = new Map<string, RateLimitWindow>();

  const auditLog = (
    event: string,
    request: IncomingMessage,
    extras?: Record<string, unknown>
  ): void => {
    if (!hardening.audit.enabled) {
      return;
    }

    const details: Record<string, unknown> = {
      event,
      method: request.method,
      url: request.url,
      remoteAddress: resolveClientAddress(request),
      timestamp: new Date().toISOString(),
      ...extras,
    };

    if (hardening.audit.includeHeaders) {
      details.headers = request.headers;
    }

    logger(`[nexular-mcp-http][audit] ${JSON.stringify(details)}`);
  };

  const unsubscribeNotifications = service.onNotification((notification) => {
    broadcastNotification(clients, notification);
  });

  const server = http.createServer(async (request, response) => {
    if (!request.url || !request.method) {
      response.statusCode = 400;
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);

    const isMcpTraffic =
      (request.method === "POST" && url.pathname === mcpPath) ||
      (request.method === "GET" && url.pathname === streamPath);

    if (isMcpTraffic && hardening.rateLimit.enabled) {
      const clientKey = resolveClientAddress(request);
      const limited = shouldRateLimit(
        rateLimitWindows,
        clientKey,
        Date.now(),
        hardening.rateLimit.maxRequestsPerWindow,
        hardening.rateLimit.windowMs
      );

      if (limited) {
        auditLog("mcp_http.rate_limited", request, {
          path: url.pathname,
        });
        writeJson(response, 429, {
          ok: false,
          error: "Rate limit exceeded",
        });
        return;
      }
    }

    const corsAllowed = applyCorsHeaders(request, response, cors);
    if (!corsAllowed) {
      auditLog("mcp_http.cors_denied", request, {
        path: url.pathname,
      });
      writeJson(response, 403, {
        ok: false,
        error: "CORS origin denied",
      });
      return;
    }

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, { ok: true, transport: "http" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      const lifecycle = service.getLifecycleState();
      const uptimeMs = Date.now() - startedAt;

      const readiness = {
        ok: true,
        transport: "http",
        status: "ready",
        uptimeMs,
        timestamp: new Date().toISOString(),
        endpoint: {
          mcpPath,
          streamPath,
        },
        auth: {
          enabled: Boolean(bearerToken),
        },
        cors,
        mcpLifecycle: lifecycle,
        clients: {
          sse: clients.size,
        },
      };

      writeJson(response, 200, readiness);
      return;
    }

    if (request.method === "GET" && url.pathname === streamPath) {
      if (!isAuthorized(request, bearerToken)) {
        auditLog("mcp_http.auth_denied", request, {
          path: url.pathname,
        });
        writeJson(response, 401, {
          ok: false,
          error: "Unauthorized",
        });
        return;
      }

      if (clients.size >= hardening.quotas.maxSSEClients) {
        auditLog("mcp_http.quota_exceeded", request, {
          path: url.pathname,
          quota: "sse_clients",
          current: clients.size,
          limit: hardening.quotas.maxSSEClients,
        });
        writeJson(response, 429, {
          ok: false,
          error: "SSE client quota exceeded",
        });
        return;
      }

      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.write(": connected\n\n");

      const client: HttpClient = {
        id: ++sequence,
        response,
      };

      clients.add(client);
      auditLog("mcp_http.sse_connected", request, {
        path: url.pathname,
        clientId: client.id,
        clients: clients.size,
      });

      request.on("close", () => {
        clients.delete(client);
        auditLog("mcp_http.sse_disconnected", request, {
          path: url.pathname,
          clientId: client.id,
          clients: clients.size,
        });
      });

      return;
    }

    if (request.method === "POST" && url.pathname === mcpPath) {
      if (!isAuthorized(request, bearerToken)) {
        auditLog("mcp_http.auth_denied", request, {
          path: url.pathname,
        });
        writeJson(response, 401, {
          ok: false,
          error: "Unauthorized",
        });
        return;
      }

      let parsedBody: unknown;

      try {
        parsedBody = await readJsonBody(request, hardening.quotas.maxRequestBodyBytes);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          auditLog("mcp_http.quota_exceeded", request, {
            path: url.pathname,
            quota: "request_body_bytes",
            limit: hardening.quotas.maxRequestBodyBytes,
          });
          writeJson(response, 413, errorResponse(null, -32010, error.message));
          return;
        }

        writeJson(response, 400, errorResponse(null, -32700, "Parse error"));
        return;
      }

      if (!isJsonRpcRequest(parsedBody)) {
        writeJson(response, 400, errorResponse(null, -32600, "Invalid Request"));
        return;
      }

      try {
        const rpcResponse = await service.handleJsonRpcRequest(parsedBody, { projectRoot });

        if (!rpcResponse) {
          response.statusCode = 202;
          response.end();
          return;
        }

        auditLog("mcp_http.rpc_ok", request, {
          path: url.pathname,
          method: parsedBody.method,
        });
        writeJson(response, 200, rpcResponse);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown server error";
        auditLog("mcp_http.rpc_error", request, {
          path: url.pathname,
          message,
        });
        writeJson(response, 500, errorResponse(parsedBody.id ?? null, -32000, message));
        return;
      }
    }

    writeJson(response, 404, {
      ok: false,
      error: `Not found: ${url.pathname}`,
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      unsubscribeNotifications();
      reject(error);
    });

    server.listen(port, host, () => {
      logger(`[nexular-mcp-http] listening on http://${host}:${port}${mcpPath}`);
      resolve({
        server,
        address: () => server.address(),
        stop: async () => {
          unsubscribeNotifications();
          clients.forEach((client) => {
            client.response.end();
          });
          clients.clear();

          await new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          });
        },
      });
    });
  });
}

export function resolveMCPHttpOptionsFromEnv(): Pick<
  HttpTransportOptions,
  "auth" | "cors" | "security"
> {
  const bearerToken = process.env.NEXULAR_MCP_HTTP_BEARER_TOKEN;
  const corsEnabled =
    (process.env.NEXULAR_MCP_HTTP_CORS_ENABLED ?? "false").toLowerCase() === "true";

  return {
    auth: {
      bearerToken: bearerToken && bearerToken.trim() ? bearerToken.trim() : undefined,
    },
    cors: {
      enabled: corsEnabled,
      allowOrigins: parseList(process.env.NEXULAR_MCP_HTTP_CORS_ORIGINS, ["*"]),
      allowMethods: parseList(process.env.NEXULAR_MCP_HTTP_CORS_METHODS, [
        "GET",
        "POST",
        "OPTIONS",
      ]),
      allowHeaders: parseList(process.env.NEXULAR_MCP_HTTP_CORS_HEADERS, [
        "Content-Type",
        "Authorization",
      ]),
      allowCredentials:
        (process.env.NEXULAR_MCP_HTTP_CORS_CREDENTIALS ?? "false").toLowerCase() === "true",
    },
    security: {
      rateLimit: {
        enabled:
          (process.env.NEXULAR_MCP_HTTP_RATE_LIMIT_ENABLED ?? "false").toLowerCase() === "true",
        maxRequestsPerWindow: Number(process.env.NEXULAR_MCP_HTTP_RATE_LIMIT_MAX_REQUESTS ?? 120),
        windowMs: Number(process.env.NEXULAR_MCP_HTTP_RATE_LIMIT_WINDOW_MS ?? 60_000),
      },
      quotas: {
        maxSSEClients: Number(process.env.NEXULAR_MCP_HTTP_MAX_SSE_CLIENTS ?? 250),
        maxRequestBodyBytes: Number(process.env.NEXULAR_MCP_HTTP_MAX_REQUEST_BYTES ?? 1_048_576),
      },
      audit: {
        enabled: (process.env.NEXULAR_MCP_HTTP_AUDIT_ENABLED ?? "false").toLowerCase() === "true",
        includeHeaders:
          (process.env.NEXULAR_MCP_HTTP_AUDIT_INCLUDE_HEADERS ?? "false").toLowerCase() === "true",
      },
    },
  };
}
