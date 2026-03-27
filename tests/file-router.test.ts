import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRouteContext, discoverRoutes, resolveRoute } from "../src/server/file-router";

describe("File router", () => {
  it("should discover routes from app/routes folder", () => {
    const routesDir = path.join(process.cwd(), "src/app/routes");
    const routes = discoverRoutes(routesDir);

    const paths = routes.map((route) => route.path).sort();
    expect(paths).toContain("/");
    expect(paths).toHaveLength(1);
  });

  it("should build route context with query params", () => {
    const ctx = createRouteContext(
      "/",
      "pt",
      "?tab=home&lang=pt",
      { id: "10" },
      { ip: "127.0.0.1" }
    );

    expect(ctx.path).toBe("/");
    expect(ctx.locale).toBe("pt");
    expect(ctx.searchParams.get("tab")).toBe("home");
    expect(ctx.params.id).toBe("10");
    expect(ctx.request?.ip).toBe("127.0.0.1");
  });

  it("should resolve root route and include inherited middleware", async () => {
    const routesDir = path.join(process.cwd(), "src/app/routes");
    const route = await resolveRoute("/", routesDir);

    expect(route).toBeTruthy();
    expect(route?.path).toBe("/");
    expect(route?.middlewares.length).toBe(1);
    expect(route?.actions).toEqual({});
  });

  it("should return null for dynamic routes not present in core package", async () => {
    const routesDir = path.join(process.cwd(), "src/app/routes");
    const route = await resolveRoute("/docs/core/routing/advanced", routesDir);
    expect(route).toBeNull();
  });
});
