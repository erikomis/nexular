export type Route = {
  path: string;
  component?: any;
  loadComponent?: () => Promise<any>;
  loadModule?: () => Promise<any>;
  canActivate?: CanActivateGuard | CanActivateGuard[];
  canDeactivate?: CanDeactivateGuard | CanDeactivateGuard[];
  prefetch?: boolean;
  guard?: { canActivate: () => boolean | Promise<boolean> };
};

export type CanActivateGuard = (context: {
  from: Route | null;
  to: Route;
  path: string;
  router: Router;
}) => boolean | Promise<boolean>;

export type CanDeactivateGuard = (context: {
  from: Route;
  to: Route;
  path: string;
  router: Router;
}) => boolean | Promise<boolean>;

export class Router {
  private currentRoute: Route | null = null;
  private prefetchCache = new Map<string, unknown>();

  constructor(private readonly routes: Route[]) {}

  async navigate(path: string): Promise<any> {
    const route = this.routes.find((r) => r.path === path);

    if (!route) {
      throw new Error(`Route not found: ${path}`);
    }

    if (this.currentRoute) {
      await this.runCanDeactivateGuards(this.currentRoute, route, path);
    }

    if (route.guard) {
      const canActivate = await route.guard.canActivate();
      if (!canActivate) {
        throw new Error(`Navigation cancelled by guard for route: ${path}`);
      }
    }

    await this.runCanActivateGuards(route, path);

    const loaded = await this.resolveRoutePayload(route, path);
    this.currentRoute = route;
    return loaded;
  }

  async prefetch(path: string): Promise<void> {
    const route = this.routes.find((candidate) => candidate.path === path);
    if (!route) {
      throw new Error(`Route not found: ${path}`);
    }

    if (!route.loadModule && !route.loadComponent) {
      return;
    }

    await this.resolveRoutePayload(route, path);
  }

  async prefetchMarkedRoutes(): Promise<void> {
    const targets = this.routes.filter(
      (route) => route.prefetch && (route.loadModule || route.loadComponent)
    );
    await Promise.all(targets.map((route) => this.prefetch(route.path)));
  }

  getCurrentRoute(): Route | null {
    return this.currentRoute;
  }

  private async resolveRoutePayload(route: Route, path: string): Promise<any> {
    const cached = this.prefetchCache.get(path);
    if (cached !== undefined) {
      return cached;
    }

    if (route.loadComponent) {
      const loadedComponent = await route.loadComponent();
      this.prefetchCache.set(path, loadedComponent);
      return loadedComponent;
    }

    if (route.loadModule) {
      const loadedModule = await route.loadModule();
      this.prefetchCache.set(path, loadedModule);
      return loadedModule;
    }

    return route.component;
  }

  private async runCanActivateGuards(route: Route, path: string): Promise<void> {
    const guardList = normalizeGuardArray(route.canActivate);
    if (guardList.length === 0) {
      return;
    }

    for (const guard of guardList) {
      const allowed = await guard({
        from: this.currentRoute,
        to: route,
        path,
        router: this,
      });

      if (!allowed) {
        throw new Error(`Navigation cancelled by canActivate for route: ${path}`);
      }
    }
  }

  private async runCanDeactivateGuards(
    fromRoute: Route,
    toRoute: Route,
    path: string
  ): Promise<void> {
    const guardList = normalizeGuardArray(fromRoute.canDeactivate);
    if (guardList.length === 0) {
      return;
    }

    for (const guard of guardList) {
      const allowed = await guard({
        from: fromRoute,
        to: toRoute,
        path,
        router: this,
      });

      if (!allowed) {
        throw new Error(`Navigation cancelled by canDeactivate for route: ${path}`);
      }
    }
  }
}

function normalizeGuardArray<T>(guard: T | T[] | undefined): T[] {
  if (!guard) {
    return [];
  }

  return Array.isArray(guard) ? guard : [guard];
}
