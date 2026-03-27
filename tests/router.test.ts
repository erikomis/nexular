import { describe, expect, it } from "vitest";
import { Router, type Route } from "../src/app/core";

const routes: Route[] = [
  {
    path: "/",
    component: { name: "RootComponent" },
  },
  {
    path: "/lazy",
    loadModule: async () => ({ default: { name: "LazyModule" } }),
  },
  {
    path: "/lazy-component",
    loadComponent: async () => ({ name: "LazyComponent" }),
    prefetch: true,
  },
];

describe("Router", () => {
  it("should navigate to static component route", async () => {
    const router = new Router(routes);
    const routeComponent = await router.navigate("/");

    expect(routeComponent).toBeDefined();
    expect(routeComponent.name).toBe("RootComponent");
  });

  it("should lazy load module route", async () => {
    const router = new Router(routes);
    const loaded = await router.navigate("/lazy");

    expect(loaded).toBeDefined();
    expect(loaded.default.name).toBe("LazyModule");
  });

  it("should throw for unknown route", async () => {
    const router = new Router(routes);
    await expect(router.navigate("/missing")).rejects.toThrow("Route not found: /missing");
  });

  it("should run function-based canActivate guard", async () => {
    const guardedRoutes: Route[] = [
      {
        path: "/secure",
        component: { name: "Secure" },
        canActivate: () => false,
      },
    ];

    const router = new Router(guardedRoutes);
    await expect(router.navigate("/secure")).rejects.toThrow(
      "Navigation cancelled by canActivate for route: /secure"
    );
  });

  it("should run canDeactivate guard from current route", async () => {
    const guardedRoutes: Route[] = [
      {
        path: "/editor",
        component: { name: "Editor" },
        canDeactivate: () => false,
      },
      {
        path: "/home",
        component: { name: "Home" },
      },
    ];

    const router = new Router(guardedRoutes);
    await router.navigate("/editor");
    await expect(router.navigate("/home")).rejects.toThrow(
      "Navigation cancelled by canDeactivate for route: /home"
    );
  });

  it("should prefetch marked lazy routes and reuse cache on navigate", async () => {
    let loaderCalls = 0;
    const prefetchRoutes: Route[] = [
      {
        path: "/prefetch",
        prefetch: true,
        loadComponent: async () => {
          loaderCalls += 1;
          return { name: "PrefetchedComponent" };
        },
      },
    ];

    const router = new Router(prefetchRoutes);
    await router.prefetchMarkedRoutes();
    const loaded = await router.navigate("/prefetch");

    expect(loaded.name).toBe("PrefetchedComponent");
    expect(loaderCalls).toBe(1);
  });
});
