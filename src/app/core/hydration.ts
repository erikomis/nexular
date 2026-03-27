import { getComponentMetadata } from "./component/component";
import { container } from "./di/container";
import { I18nService } from "./mcp/i18n";
import { createComponentInstance, renderTemplate } from "./renderer";

declare global {
  interface Window {
    __NEXULAR_HYDRATION__?: {
      locale?: string;
      islands: Array<{
        selector: string;
        component: string;
        template?: string;
        state: Record<string, unknown>;
      }>;
    };
  }
}

function getSignals(instance: Record<string, any>) {
  return Object.values(instance).filter((value) => {
    return typeof value === "function" && Boolean((value as any).subscribe);
  }) as Array<{ subscribe: (fn: () => void) => () => void }>;
}

function attachDelegatedEvents(root: Element, instance: Record<string, any>): void {
  const supportedEvents = ["click", "input", "change", "blur", "submit"];

  const modelState = new WeakMap<Element, { touched: boolean; dirty: boolean }>();

  const applyControlClasses = (
    element: Element,
    state: {
      touched: boolean;
      dirty: boolean;
      valid: boolean;
      invalid: boolean;
      pending?: boolean;
    }
  ): void => {
    element.classList.toggle("nx-touched", state.touched);
    element.classList.toggle("nx-untouched", !state.touched);
    element.classList.toggle("nx-dirty", state.dirty);
    element.classList.toggle("nx-pristine", !state.dirty);
    element.classList.toggle("nx-valid", state.valid);
    element.classList.toggle("nx-invalid", state.invalid);
    if (state.pending !== undefined) {
      element.classList.toggle("nx-pending", state.pending);
    }
  };

  const syncControlStateClasses = (element: Element): void => {
    const controlExpr = element.getAttribute("data-nx-control");
    if (controlExpr) {
      const control = resolvePath(controlExpr) as
        | {
            touched?: () => boolean;
            dirty?: () => boolean;
            valid?: () => boolean;
            invalid?: () => boolean;
            pending?: () => boolean;
          }
        | undefined;

      if (control) {
        applyControlClasses(element, {
          touched: typeof control.touched === "function" ? control.touched() : false,
          dirty: typeof control.dirty === "function" ? control.dirty() : false,
          valid: typeof control.valid === "function" ? control.valid() : true,
          invalid: typeof control.invalid === "function" ? control.invalid() : false,
          pending: typeof control.pending === "function" ? control.pending() : false,
        });
        return;
      }
    }

    const currentModelState = modelState.get(element) ?? { touched: false, dirty: false };
    applyControlClasses(element, {
      touched: currentModelState.touched,
      dirty: currentModelState.dirty,
      valid: true,
      invalid: false,
    });
  };

  const syncModelGroupStateClasses = (element: Element): void => {
    const groupExpr = element.getAttribute("data-nx-model-group");
    if (!groupExpr) {
      return;
    }

    const group = resolvePath(groupExpr) as
      | {
          touched?: () => boolean;
          dirty?: () => boolean;
          valid?: () => boolean;
          invalid?: () => boolean;
        }
      | undefined;

    if (!group) {
      return;
    }

    applyControlClasses(element, {
      touched: typeof group.touched === "function" ? group.touched() : false,
      dirty: typeof group.dirty === "function" ? group.dirty() : false,
      valid: typeof group.valid === "function" ? group.valid() : true,
      invalid: typeof group.invalid === "function" ? group.invalid() : false,
    });
  };

  const resolvePath = (pathExpr: string): unknown => {
    return pathExpr.split(".").reduce<unknown>((current, key) => {
      if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, instance);
  };

  const assignPath = (pathExpr: string, value: unknown): void => {
    const keys = pathExpr.split(".");
    const last = keys.pop();
    if (!last) return;

    const parent = keys.reduce<unknown>((current, key) => {
      if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, instance);

    if (parent && typeof parent === "object") {
      (parent as Record<string, unknown>)[last] = value;
    }
  };

  root.querySelectorAll("[data-nx-control], [data-nx-model]").forEach((el) => {
    modelState.set(el, { touched: false, dirty: false });
    syncControlStateClasses(el);
  });

  root.querySelectorAll("[data-nx-model-group]").forEach((el) => {
    syncModelGroupStateClasses(el);
  });

  supportedEvents.forEach((eventName) => {
    root.addEventListener(eventName, (event) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      if (eventName === "input" || eventName === "change") {
        const controlElement = target.closest("[data-nx-control]") as HTMLElement | null;
        const modelElement = target.closest("[data-nx-model]") as HTMLElement | null;
        const inputEl = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

        if (controlElement) {
          const controlExpr = controlElement.getAttribute("data-nx-control");
          const control = controlExpr
            ? (resolvePath(controlExpr) as
                | { setValue?: (value: unknown) => void; markAsTouched?: () => void }
                | undefined)
            : undefined;

          if (control && typeof control.setValue === "function") {
            const nextValue =
              inputEl instanceof HTMLInputElement && inputEl.type === "checkbox"
                ? inputEl.checked
                : inputEl.value;
            control.setValue(nextValue);
            if (eventName === "change" && typeof control.markAsTouched === "function") {
              control.markAsTouched();
            }
            syncControlStateClasses(controlElement);
          }

          const groupElement = controlElement.closest("[data-nx-model-group]");
          if (groupElement) {
            syncModelGroupStateClasses(groupElement);
          }
        }

        if (modelElement) {
          const modelExpr = modelElement.getAttribute("data-nx-model");
          if (modelExpr) {
            const nextValue =
              inputEl instanceof HTMLInputElement && inputEl.type === "checkbox"
                ? inputEl.checked
                : inputEl.value;
            assignPath(modelExpr, nextValue);

            const currentState = modelState.get(modelElement) ?? { touched: false, dirty: false };
            currentState.dirty = true;
            if (eventName === "change") {
              currentState.touched = true;
            }
            modelState.set(modelElement, currentState);
            syncControlStateClasses(modelElement);
          }
        }
      }

      if (eventName === "blur") {
        const controlElement = target.closest(
          "[data-nx-control], [data-nx-model]"
        ) as HTMLElement | null;

        if (controlElement) {
          const controlExpr = controlElement.getAttribute("data-nx-control");
          if (controlExpr) {
            const control = resolvePath(controlExpr) as { markAsTouched?: () => void } | undefined;
            if (control && typeof control.markAsTouched === "function") {
              control.markAsTouched();
            }
          } else {
            const currentState = modelState.get(controlElement) ?? { touched: false, dirty: false };
            currentState.touched = true;
            modelState.set(controlElement, currentState);
          }

          syncControlStateClasses(controlElement);

          const groupElement = controlElement.closest("[data-nx-model-group]");
          if (groupElement) {
            syncModelGroupStateClasses(groupElement);
          }
        }
      }

      const selector = `[data-nx-on-${eventName}]`;
      const eventTarget = target.closest(selector);
      if (!eventTarget || !root.contains(eventTarget)) {
        return;
      }

      if (eventName === "submit") {
        event.preventDefault();

        const form = target.closest("form");
        if (form) {
          form.classList.add("nx-submitted");
        }
      }

      const handlerName = eventTarget.getAttribute(`data-nx-on-${eventName}`);
      if (!handlerName) {
        return;
      }

      const handler = instance[handlerName];
      if (typeof handler === "function") {
        handler.call(instance, event);
      }
    });
  });
}

export function hydrateComponent(
  ComponentClass: any,
  rootSelector = "app-root",
  state: Record<string, unknown> = {},
  options?: { templateOverride?: string }
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const metadata = getComponentMetadata(ComponentClass);
  if (!metadata) {
    throw new Error("Component metadata not found. Did you use @Component?");
  }

  const root = document.querySelector(rootSelector);
  if (!root) {
    throw new Error(`Hydration root not found: ${rootSelector}`);
  }

  const instance = createComponentInstance(ComponentClass, state);
  const template = options?.templateOverride || metadata.template;

  const rerender = () => {
    if (!template) {
      return;
    }

    root.innerHTML = renderTemplate(template, instance);
  };

  const unsubscribers = getSignals(instance).map((signal) => signal.subscribe(rerender));

  attachDelegatedEvents(root, instance);

  return () => unsubscribers.forEach((unsub) => unsub());
}

type HydrationPayload = NonNullable<Window["__NEXULAR_HYDRATION__"]>;
type HydrationIsland = HydrationPayload["islands"][number];

const hydrationMetrics = {
  startTime: 0,
  endTime: 0,
  islands: new Map<string, { startTime: number; endTime: number; selector: string }>(),
  progressiveEnabled: false,
};

const hydratedSelectors = new Set<string>();

function resetHydrationMetrics(progressiveEnabled: boolean): void {
  hydrationMetrics.startTime = performance.now();
  hydrationMetrics.endTime = hydrationMetrics.startTime;
  hydrationMetrics.islands.clear();
  hydrationMetrics.progressiveEnabled = progressiveEnabled;
  hydratedSelectors.clear();
}

function hydrateIsland(registry: Record<string, any>, island: HydrationIsland): void {
  if (hydratedSelectors.has(island.selector)) {
    return;
  }

  const ComponentClass = registry[island.component];
  if (!ComponentClass) {
    return;
  }

  const startTime = performance.now();
  hydrateComponent(ComponentClass, island.selector, island.state ?? {}, {
    templateOverride: island.template,
  });
  const endTime = performance.now();

  hydratedSelectors.add(island.selector);
  hydrationMetrics.islands.set(island.selector, {
    startTime,
    endTime,
    selector: island.selector,
  });
  hydrationMetrics.endTime = endTime;
}

function setupIntersectionObserver(
  registry: Record<string, any>,
  islands: HydrationIsland[]
): void {
  if (islands.length === 0) {
    return;
  }

  let pending = 0;
  const islandByElement = new Map<Element, HydrationIsland>();

  islands.forEach((island) => {
    const element = document.querySelector(island.selector);
    if (!element) {
      return;
    }

    islandByElement.set(element, island);
    pending += 1;
  });

  if (pending === 0) {
    hydrationMetrics.endTime = performance.now();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const island = islandByElement.get(entry.target);
        if (!island) {
          return;
        }

        hydrateIsland(registry, island);
        observer.unobserve(entry.target);
        islandByElement.delete(entry.target);
        pending -= 1;

        if (pending <= 0) {
          hydrationMetrics.endTime = performance.now();
        }
      });
    },
    {
      rootMargin: "50px",
    }
  );

  islandByElement.forEach((_island, element) => {
    observer.observe(element);
  });
}

/**
 * Progressive Hydration: Hydrate islands only when they become visible
 * Uses IntersectionObserver for lazy hydration with priority queue
 */
export function hydrateIslandsProgressively(
  registry: Record<string, any>,
  options: {
    priorityGroups?: Record<string, "critical" | "high" | "normal" | "low">;
    preloadOnIdle?: boolean;
  } = {}
): void {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    hydrateIslands(registry);
    return;
  }

  const payload = window.__NEXULAR_HYDRATION__;
  if (!payload) {
    return;
  }

  resetHydrationMetrics(true);

  if (payload.locale && container.has(I18nService)) {
    container.resolve<I18nService>(I18nService).setLocale(payload.locale);
  }

  const priorities = { critical: 0, high: 1, normal: 2, low: 3 };
  const sortedIslands = [...payload.islands].sort((a: HydrationIsland, b: HydrationIsland) => {
    const priorityA = priorities[options.priorityGroups?.[a.component] || "normal"] ?? 2;
    const priorityB = priorities[options.priorityGroups?.[b.component] || "normal"] ?? 2;
    return priorityA - priorityB;
  });

  const criticalIslands: HydrationIsland[] = [];
  const deferredIslands: HydrationIsland[] = [];

  sortedIslands.forEach((island) => {
    if (options.priorityGroups?.[island.component] === "critical") {
      criticalIslands.push(island);
    } else {
      deferredIslands.push(island);
    }
  });

  criticalIslands.forEach((island) => hydrateIsland(registry, island));

  if (deferredIslands.length === 0) {
    hydrationMetrics.endTime = performance.now();
    return;
  }

  if (options.preloadOnIdle && "requestIdleCallback" in window) {
    requestIdleCallback(() => {
      setupIntersectionObserver(registry, deferredIslands);
    });
  } else {
    setupIntersectionObserver(registry, deferredIslands);
  }
}

/**
 * Immediate Hydration: Hydrate all islands at once
 */
export function hydrateIslands(registry: Record<string, any>): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload = window.__NEXULAR_HYDRATION__;
  if (!payload) {
    return;
  }

  resetHydrationMetrics(false);

  if (payload.locale && container.has(I18nService)) {
    container.resolve<I18nService>(I18nService).setLocale(payload.locale);
  }

  payload.islands.forEach((island) => hydrateIsland(registry, island));

  hydrationMetrics.endTime = performance.now();
}

/**
 * Get hydration performance metrics
 */
export function getHydrationMetrics(): {
  totalTime: number;
  islandCount: number;
  islandsMetrics: Array<{
    selector: string;
    time: number;
  }>;
  progressiveEnabled: boolean;
  firstIslandTime?: number;
} {
  const islandsMetrics = Array.from(hydrationMetrics.islands.values()).map((m) => ({
    selector: m.selector,
    time: m.endTime - m.startTime,
  }));

  const firstIslandTime =
    islandsMetrics.length > 0 ? Math.min(...islandsMetrics.map((m) => m.time)) : undefined;

  return {
    totalTime: hydrationMetrics.endTime - hydrationMetrics.startTime,
    islandCount: hydrationMetrics.islands.size,
    islandsMetrics,
    progressiveEnabled: hydrationMetrics.progressiveEnabled,
    firstIslandTime,
  };
}
