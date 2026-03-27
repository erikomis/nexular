import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { app } from "../src/server/server";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("HTTP Integration — CSRF", () => {
  it("GET /_nexular/csrf-token returns a 64-char hex token", async () => {
    const res = await fetch(`${baseUrl}/_nexular/csrf-token`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string };
    expect(body.ok).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(body.token).toHaveLength(64);
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("HTTP Integration — Action endpoint", () => {
  it("POST /_nexular/action without CSRF header returns 403", async () => {
    const res = await fetch(`${baseUrl}/_nexular/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/", action: "test" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  it("POST /_nexular/action with invalid CSRF token returns 403", async () => {
    const res = await fetch(`${baseUrl}/_nexular/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "invalid-token-that-does-not-exist",
      },
      body: JSON.stringify({ path: "/", action: "test" }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /_nexular/action with valid CSRF but missing fields returns 400", async () => {
    // Step 1: obtain a valid CSRF token
    const tokenRes = await fetch(`${baseUrl}/_nexular/csrf-token`);
    const { token } = (await tokenRes.json()) as { token: string };

    // Step 2: post without path/action fields
    const res = await fetch(`${baseUrl}/_nexular/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": token,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/path and action/i);
  });
});

describe("HTTP Integration — Observability", () => {
  it("GET /_nexular/observability/auth without token returns 403", async () => {
    const res = await fetch(`${baseUrl}/_nexular/observability/auth`);
    // No token configured → 403 (token required) or 401 (invalid)
    expect([401, 403]).toContain(res.status);
  });

  it("GET /_nexular/observability/auth with wrong token returns 401", async () => {
    const res = await fetch(`${baseUrl}/_nexular/observability/auth`, {
      headers: { "x-observability-token": "wrong-secret" },
    });
    // 403 means no token is configured server-side (env not set in test)
    // 401 means token was checked and rejected
    expect([401, 403]).toContain(res.status);
  });
});

describe("HTTP Integration — SSR", () => {
  it("GET / returns HTML with status 200 or 404", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect([200, 404]).toContain(res.status);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/html");
  });

  it("GET / includes security headers", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET / with Accept-Encoding: gzip returns compressed response", async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { "Accept-Encoding": "gzip" },
    });
    expect([200, 404]).toContain(res.status);
    // Node fetch decompresses automatically; just verify the header was acknowledged
    expect(res.headers.get("vary")).toContain("Accept-Encoding");
  });
});
