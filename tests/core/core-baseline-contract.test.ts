import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverRoutes, resolveRoute } from "../../src/server/file-router";
import { invokeRouteAction, renderDocument } from "../../src/server/renderer";

describe("Core baseline contract", () => {
  it("should expose only the root route in core package", () => {
    const routesDir = path.join(process.cwd(), "src/app/routes");
    const routes = discoverRoutes(routesDir);
    const paths = routes.map((route) => route.path).sort();

    expect(paths).toEqual(["/"]);
  });

  it("should resolve root route and not resolve showcase demo routes", async () => {
    const routesDir = path.join(process.cwd(), "src/app/routes");

    const root = await resolveRoute("/", routesDir);
    const forms = await resolveRoute("/forms", routesDir);
    const blog = await resolveRoute("/blog/1", routesDir);

    expect(root?.path).toBe("/");
    expect(forms).toBeNull();
    expect(blog).toBeNull();
  });

  it("should render root and keep route-rules behavior for home/legacy", async () => {
    const root = await renderDocument("/");
    const home = await renderDocument("/home");
    const legacy = await renderDocument("/legacy");

    expect(root.status).toBe(200);
    expect(root.body).toContain("Nexular Framework");

    expect(home.status).toBe(200);
    expect(home.body).toContain("Nexular Framework");

    expect(legacy.status).toBe(302);
    expect(legacy.headers?.location).toBe("/login");
  });

  it("should not expose demo route actions in the core package", async () => {
    await expect(
      invokeRouteAction({
        pathname: "/",
        action: "toggleFeature",
        input: { enabled: true },
      })
    ).rejects.toThrow("Action not found: toggleFeature");

    await expect(
      invokeRouteAction({
        pathname: "/forms",
        action: "submitContact",
        input: { name: "Erik", email: "erik@example.com" },
      })
    ).rejects.toThrow("Route not found: /forms");
  });
});
