import { describe, expect, it } from "vitest";
import { renderDocument, renderToString } from "../src/server/renderer";

describe("SSR + hydration payload", () => {
  it("should render root page with serialized state", async () => {
    const html = await renderToString("/");

    expect(html).toContain("window.__NEXULAR_STATE__=");
    expect(html).toContain('data-nx-layout="root"');
    expect(html).toContain("Core framework package ready. Build your app in a separate project.");
    expect(html).toContain("Framework Nexular");
    expect(html).not.toContain("window.__NEXULAR_HYDRATION__=");
    expect(html).not.toContain('src="/client/main.js"');
  });

  it("should render unknown route as 404 document", async () => {
    const html = await renderToString("/login");

    expect(html).toContain("<h1>404</h1>");
    expect(html).toContain("Rota nao encontrada: /login");
    expect(html).not.toContain("window.__NEXULAR_HYDRATION__=");
  });

  it("should return 404 status for missing routes", async () => {
    const result = await renderDocument("/blog/99");

    expect(result.status).toBe(404);
    expect(result.body).toContain("Rota nao encontrada: /blog/99");
  });

  it("should rewrite /home to root using route rules", async () => {
    const result = await renderDocument("/home");

    expect(result.status).toBe(200);
    expect(result.body).toContain("Nexular Framework");
  });

  it("should redirect /legacy according to route rules", async () => {
    const result = await renderDocument("/legacy");

    expect(result.status).toBe(302);
    expect(result.headers?.location).toBe("/login");
  });

  it("should keep normal root rendering in production mode", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const result = await renderDocument("/");

    expect(result.status).toBe(200);
    expect(result.body).toContain("Nexular Framework");

    process.env.NODE_ENV = previous;
  });
});
