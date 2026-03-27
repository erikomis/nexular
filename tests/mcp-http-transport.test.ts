import { beforeEach, describe, expect, it } from "vitest";
import { MCPService } from "../src/app/core/mcp/service";
import { startMCPHttpServer } from "../src/app/core/mcp/http";

describe("MCP HTTP transport", () => {
  let service: MCPService;

  beforeEach(() => {
    service = new MCPService();
  });

  it("should handle initialize and tools/list over HTTP", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const initializeResponse = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: {
              name: "http-test",
              version: "1.0.0",
            },
          },
        }),
      });

      const initPayload = (await initializeResponse.json()) as {
        result?: { serverInfo?: { name?: string } };
      };
      expect(initializeResponse.status).toBe(200);
      expect(initPayload.result?.serverInfo?.name).toBe("nexular-mcp");

      await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });

      const toolsResponse = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      });

      const toolsPayload = (await toolsResponse.json()) as {
        result?: { tools?: Array<{ name: string }> };
      };

      expect(toolsResponse.status).toBe(200);
      expect(Array.isArray(toolsPayload.result?.tools)).toBe(true);
      expect(toolsPayload.result?.tools?.some((tool) => tool.name === "nexular.codegen")).toBe(
        true
      );
    } finally {
      await handle.stop();
    }
  });

  it("should stream list_changed notifications via SSE", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: {
              name: "http-test",
              version: "1.0.0",
            },
          },
        }),
      });

      const streamResponse = await fetch(`${baseUrl}/mcp/events`, {
        headers: {
          Accept: "text/event-stream",
        },
      });

      expect(streamResponse.status).toBe(200);

      const reader = streamResponse.body?.getReader();
      expect(reader).toBeDefined();

      const notificationPromise = (async () => {
        const decoder = new TextDecoder("utf8");
        let content = "";
        const deadline = Date.now() + 1000;

        while (Date.now() < deadline) {
          const result = await reader!.read();
          if (result.done) {
            break;
          }

          content += decoder.decode(result.value, { stream: true });
          if (content.includes("notifications/tools/list_changed")) {
            return content;
          }
        }

        return content;
      })();

      service.registerTool(
        {
          name: "tool.dynamic",
          title: "Dynamic",
          description: "Dynamic test tool",
          inputSchema: {},
        },
        async () => ({
          content: [
            {
              type: "text",
              text: "ok",
            },
          ],
        })
      );

      const streamed = await notificationPromise;
      expect(streamed).toContain("notifications/tools/list_changed");
      await reader!.cancel();
    } finally {
      await handle.stop();
    }
  });

  it("should enforce optional bearer auth when configured", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
      auth: {
        bearerToken: "secret-token",
      },
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const denied = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(denied.status).toBe(401);

      const allowed = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "auth-test", version: "1.0.0" },
          },
        }),
      });

      expect(allowed.status).toBe(200);
    } finally {
      await handle.stop();
    }
  });

  it("should apply configurable CORS and handle preflight", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
      cors: {
        enabled: true,
        allowOrigins: ["https://allowed.example"],
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const denied = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://blocked.example",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(denied.status).toBe(403);

      const preflight = await fetch(`${baseUrl}/mcp`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://allowed.example",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("https://allowed.example");
    } finally {
      await handle.stop();
    }
  });

  it("should expose detailed readiness endpoint", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
      auth: {
        bearerToken: "secret",
      },
      cors: {
        enabled: true,
        allowOrigins: ["https://allowed.example"],
      },
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const readiness = await fetch(`${baseUrl}/ready`);

      const payload = (await readiness.json()) as {
        ok: boolean;
        status: string;
        auth: { enabled: boolean };
        cors: { enabled: boolean };
        mcpLifecycle: { initialized: boolean };
        clients: { sse: number };
      };

      expect(readiness.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.status).toBe("ready");
      expect(payload.auth.enabled).toBe(true);
      expect(payload.cors.enabled).toBe(true);
      expect(payload.mcpLifecycle.initialized).toBe(false);
      expect(payload.clients.sse).toBe(0);
    } finally {
      await handle.stop();
    }
  });

  it("should apply rate limiting on MCP traffic", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
      security: {
        rateLimit: {
          enabled: true,
          maxRequestsPerWindow: 1,
          windowMs: 2_000,
        },
      },
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const first = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(first.status).toBe(200);

      const second = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      });

      expect(second.status).toBe(429);
    } finally {
      await handle.stop();
    }
  });

  it("should enforce quotas for request body and SSE clients", async () => {
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
      security: {
        quotas: {
          maxRequestBodyBytes: 120,
          maxSSEClients: 1,
        },
      },
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const oversized = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {
            noisy: "x".repeat(256),
          },
        }),
      });

      expect(oversized.status).toBe(413);

      const firstStream = await fetch(`${baseUrl}/mcp/events`, {
        headers: {
          Accept: "text/event-stream",
        },
      });

      expect(firstStream.status).toBe(200);

      const secondStream = await fetch(`${baseUrl}/mcp/events`, {
        headers: {
          Accept: "text/event-stream",
        },
      });

      expect(secondStream.status).toBe(429);

      await firstStream.body?.cancel();
    } finally {
      await handle.stop();
    }
  });

  it("should emit audit logs when audit mode is enabled", async () => {
    const logs: string[] = [];
    const handle = await startMCPHttpServer({
      host: "127.0.0.1",
      port: 0,
      service,
      projectRoot: process.cwd(),
      auth: {
        bearerToken: "audit-token",
      },
      security: {
        audit: {
          enabled: true,
        },
      },
      logger: (message) => {
        logs.push(message);
      },
    });

    try {
      const address = handle.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const denied = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(denied.status).toBe(401);
      expect(logs.some((line) => line.includes("mcp_http.auth_denied"))).toBe(true);
    } finally {
      await handle.stop();
    }
  });
});
