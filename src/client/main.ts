import {
  hydrateIslands,
  hydrateIslandsProgressively,
  getHydrationMetrics,
} from "../app/core/hydration";
import { RootComponent } from "../app/modules/root/root.component";
import { setupClientRouter } from "./spa-router";

const hydrateRegistry = {
  RootComponent,
};

// Check if progressive hydration is enabled (default: true)
const enableProgressive = !(globalThis as any).__NEXULAR_HYDRATION_DISABLE_PROGRESSIVE;

// Hydrate islands with progressive hydration by default
if (enableProgressive && typeof IntersectionObserver !== "undefined") {
  hydrateIslandsProgressively(hydrateRegistry, {
    preloadOnIdle: true,
    priorityGroups: {
      RootComponent: "critical", // Root is always critical
    },
  });
} else {
  hydrateIslands(hydrateRegistry);
}

setupClientRouter({ hydrateRegistry });

// Expose hydration metrics in debug mode
if (!isProduction() && typeof (globalThis as any).__NEXULAR_DEBUG__ !== "undefined") {
  (globalThis as any).__hydrationMetrics = getHydrationMetrics;
}

function isProduction(): boolean {
  return (
    (typeof process !== "undefined" && process.env?.NODE_ENV === "production") ||
    // Fallback for browser environment
    (typeof window !== "undefined" && window.location?.protocol !== "http:")
  );
}
