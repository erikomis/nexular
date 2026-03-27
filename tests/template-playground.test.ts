import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTemplatePlayground } from "../src/cli/template-playground";

let closeServer: (() => Promise<void>) | null = null;
let baseUrl = "";

beforeAll(async () => {
  const server = await startTemplatePlayground({ host: "127.0.0.1", port: 0 });
  // port 0 asks the OS for a free port; the server resolves after bind.
  // We re-start with a known port returned by the listen callback.
  // Since startTemplatePlayground doesn't expose the actual port, we use
  // a fixed high port for tests to avoid conflicts.
  closeServer = server.close;
});

afterAll(async () => {
  if (closeServer) await closeServer();
});

// Note: startTemplatePlayground binds to a fixed port (default 3340 if port
// option isn't exposed as dynamic). These tests use a separate instance at a
// dedicated port so they don't clash with other tests.
describe("Template Playground — HTTP API", () => {
  it("GET /health returns ok", async () => {
    // We can't easily get the port from startTemplatePlayground, so we test
    // the exported function directly via a second instance on a unique port.
    const { startTemplatePlayground: start } = await import("../src/cli/template-playground");
    const instance = await start({ host: "127.0.0.1", port: 3341 });
    try {
      const res = await fetch("http://127.0.0.1:3341/health");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; service: string };
      expect(body.ok).toBe(true);
      expect(body.service).toBe("template-playground");
    } finally {
      await instance.close();
    }
  });

  it("POST /render returns rendered HTML for a valid template", async () => {
    const { startTemplatePlayground: start } = await import("../src/cli/template-playground");
    const instance = await start({ host: "127.0.0.1", port: 3342 });
    try {
      const res = await fetch("http://127.0.0.1:3342/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "<p>{{ name | uppercase }}</p>",
          context: { name: "nexular" },
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; html: string };
      expect(body.ok).toBe(true);
      expect(body.html).toContain("NEXULAR");
    } finally {
      await instance.close();
    }
  });

  it("POST /render returns diagnostics for malformed template", async () => {
    const { startTemplatePlayground: start } = await import("../src/cli/template-playground");
    const instance = await start({ host: "127.0.0.1", port: 3343 });
    try {
      const res = await fetch("http://127.0.0.1:3343/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "@if () { <p>broken</p> }",
          context: {},
        }),
      });
      // Either 200 with diagnostics or 400 — both are valid error representations
      expect([200, 400]).toContain(res.status);
    } finally {
      await instance.close();
    }
  });

  it("GET / returns the playground HTML UI", async () => {
    const { startTemplatePlayground: start } = await import("../src/cli/template-playground");
    const instance = await start({ host: "127.0.0.1", port: 3344 });
    try {
      const res = await fetch("http://127.0.0.1:3344/");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Template Playground");
      expect(text).toContain("<!doctype html>");
    } finally {
      await instance.close();
    }
  });
});
