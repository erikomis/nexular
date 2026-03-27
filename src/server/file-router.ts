import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { HydrationMode } from "../app/core";
import type {
  CachePolicy,
  DataLoader,
  ErrorBoundaryRenderer,
  HeadProvider,
  PageHead,
  RouteContext,
  RouteMiddleware,
  ServerAction,
} from "../app/core/server-actions";

export type PageModule = {
  component: any;
  revalidate?: number;
  loadData?: DataLoader<any>;
  cache?: CachePolicy;
  actions?: Record<string, ServerAction<any, any>>;
  head?: PageHead | HeadProvider;
};

type ApiHandler = (ctx: RouteContext) => Promise<unknown>;

/** Module shape for `api.ts` route files — export HTTP-method handlers. */
export type ApiRouteModule = {
  GET?: ApiHandler;
  POST?: ApiHandler;
  PUT?: ApiHandler;
  PATCH?: ApiHandler;
  DELETE?: ApiHandler;
};

export type LayoutModule = {
  renderLayout?: (content: string, context: { path: string; locale: string }) => string;
  loadLayoutData?: DataLoader<any>;
  cache?: CachePolicy;
};

export type MiddlewareModule = {
  middleware?: RouteMiddleware;
};

export type ErrorModule = {
  renderError?: ErrorBoundaryRenderer;
};

export type RouteDefinition = {
  path: string;
  pageFile: string;
  layoutFiles: string[];
  middlewareFiles: string[];
  errorFiles: string[];
};

export type ResolvedRoute = {
  path: string;
  params: Record<string, string | string[]>;
  component: any;
  revalidate: number;
  hydrate: HydrationMode;
  loadData?: DataLoader<any>;
  cache?: CachePolicy;
  actions: Record<string, ServerAction<any, any>>;
  middlewares: RouteMiddleware[];
  errorBoundaries: ErrorBoundaryRenderer[];
  head?: PageHead | HeadProvider;
  layouts: Array<{
    renderLayout: (content: string, context: { path: string; locale: string }) => string;
    loadLayoutData?: DataLoader<any>;
    cache?: CachePolicy;
  }>;
};

function normalizePathname(value: string): string {
  if (!value) return "/";
  const normalized = value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
  return normalized || "/";
}

function matchRoutePath(
  candidatePath: string,
  routePattern: string
): { matched: boolean; params: Record<string, string | string[]> } {
  const candidate = normalizePathname(candidatePath);
  const pattern = normalizePathname(routePattern);

  const candidateSegments = candidate.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);

  const params: Record<string, string | string[]> = {};

  let i = 0;
  let j = 0;

  while (i < patternSegments.length) {
    const segment = patternSegments[i];
    const value = candidateSegments[j];

    if (segment.startsWith("[...") && segment.endsWith("]")) {
      const key = segment.slice(4, -1);
      params[key] = candidateSegments.slice(j);
      j = candidateSegments.length;
      i += 1;
      continue;
    }

    if (segment.startsWith("[") && segment.endsWith("]")) {
      if (value === undefined) {
        return { matched: false, params: {} };
      }

      const key = segment.slice(1, -1);
      params[key] = value;
      i += 1;
      j += 1;
      continue;
    }

    if (segment !== value) {
      return { matched: false, params: {} };
    }

    i += 1;
    j += 1;
  }

  if (j !== candidateSegments.length) {
    return { matched: false, params: {} };
  }

  return { matched: true, params };
}

function pickFile(dir: string, baseName: string): string | null {
  const tsPath = path.join(dir, `${baseName}.ts`);
  const jsPath = path.join(dir, `${baseName}.js`);

  if (fs.existsSync(tsPath)) return tsPath;
  if (fs.existsSync(jsPath)) return jsPath;
  return null;
}

function toRoutePath(relativeDir: string): string {
  if (!relativeDir || relativeDir === ".") {
    return "/";
  }

  const route = `/${relativeDir.split(path.sep).join("/")}`;
  return route.replace(/\/index$/, "") || "/";
}

function discoverRoutesInternal(
  baseDir: string,
  currentDir: string,
  activeLayouts: string[],
  activeMiddlewares: string[],
  activeErrors: string[],
  output: RouteDefinition[]
): void {
  const localLayout = pickFile(currentDir, "layout");
  const localMiddleware = pickFile(currentDir, "middleware");
  const localError = pickFile(currentDir, "error");

  const currentLayouts = localLayout ? [...activeLayouts, localLayout] : activeLayouts;
  const currentMiddlewares = localMiddleware
    ? [...activeMiddlewares, localMiddleware]
    : activeMiddlewares;
  const currentErrors = localError ? [...activeErrors, localError] : activeErrors;

  const localPage = pickFile(currentDir, "page");
  if (localPage) {
    const relativeDir = path.relative(baseDir, currentDir);
    output.push({
      path: toRoutePath(relativeDir),
      pageFile: localPage,
      layoutFiles: currentLayouts,
      middlewareFiles: currentMiddlewares,
      errorFiles: currentErrors,
    });
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.forEach((entry) => {
    if (!entry.isDirectory()) return;
    discoverRoutesInternal(
      baseDir,
      path.join(currentDir, entry.name),
      currentLayouts,
      currentMiddlewares,
      currentErrors,
      output
    );
  });
}

export function discoverRoutes(routesDir: string): RouteDefinition[] {
  if (!fs.existsSync(routesDir)) {
    return [];
  }

  const routes: RouteDefinition[] = [];
  discoverRoutesInternal(routesDir, routesDir, [], [], [], routes);
  return routes;
}

function isDynamicSegment(dirName: string): boolean {
  return /^\[[^\]]+\]$/.test(dirName) && !/^\[\.\.\.[^\]]+\]$/.test(dirName);
}

function isCatchAllSegment(dirName: string): boolean {
  return /^\[\.\.\.[^\]]+\]$/.test(dirName);
}

function pickNextDirectory(currentDir: string, segment: string): string | null {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  const exact = directories.find((name) => name === segment);
  if (exact) {
    return path.join(currentDir, exact);
  }

  const dynamic = directories.find((name) => isDynamicSegment(name));
  if (dynamic) {
    return path.join(currentDir, dynamic);
  }

  const catchAll = directories.find((name) => isCatchAllSegment(name));
  if (catchAll) {
    return path.join(currentDir, catchAll);
  }

  return null;
}

async function importModule<T>(filePath: string): Promise<T> {
  if (filePath.endsWith(".js")) {
    // CommonJS runtime in dist cannot require file:// URLs.
    return require(filePath) as T;
  }

  const fileUrl = pathToFileURL(filePath).href;
  const imported = (await import(fileUrl)) as Record<string, unknown>;

  // TS loaders in CommonJS apps may wrap exports under `default` or `module.exports`.
  const candidates = [
    imported,
    imported.default as Record<string, unknown> | undefined,
    imported["module.exports"] as Record<string, unknown> | undefined,
  ].filter((value): value is Record<string, unknown> => Boolean(value));

  const preferred = candidates.find((candidate) => {
    return (
      "component" in candidate ||
      "renderLayout" in candidate ||
      "middleware" in candidate ||
      "GET" in candidate ||
      "POST" in candidate ||
      "PUT" in candidate ||
      "DELETE" in candidate
    );
  });

  return (preferred ?? imported) as T;
}

export async function resolveMiddlewaresForPath(
  routePath: string,
  routesDir: string
): Promise<RouteMiddleware[]> {
  if (!fs.existsSync(routesDir)) {
    return [];
  }

  const middlewares: RouteMiddleware[] = [];
  const normalized = normalizePathname(routePath);
  const segments = normalized.split("/").filter(Boolean);

  let currentDir = routesDir;
  const rootMiddleware = pickFile(currentDir, "middleware");
  if (rootMiddleware) {
    const mod = await importModule<MiddlewareModule>(rootMiddleware);
    if (typeof mod.middleware === "function") {
      middlewares.push(mod.middleware);
    }
  }

  for (const segment of segments) {
    const nextDir = pickNextDirectory(currentDir, segment);
    if (!nextDir) {
      break;
    }

    currentDir = nextDir;
    const localMiddleware = pickFile(currentDir, "middleware");
    if (localMiddleware) {
      const mod = await importModule<MiddlewareModule>(localMiddleware);
      if (typeof mod.middleware === "function") {
        middlewares.push(mod.middleware);
      }
    }

    if (isCatchAllSegment(path.basename(currentDir))) {
      break;
    }
  }

  return middlewares;
}

export async function resolveRoute(
  routePath: string,
  routesDir: string
): Promise<ResolvedRoute | null> {
  const normalized = normalizePathname(routePath);
  const routes = discoverRoutes(routesDir);
  const match = routes
    .map((route) => ({ route, result: matchRoutePath(normalized, route.path) }))
    .find((entry) => entry.result.matched);

  const found = match?.route;

  if (!found) {
    return null;
  }

  const page = await importModule<PageModule>(found.pageFile);
  const layoutModules = await Promise.all(
    found.layoutFiles.map((layoutFile) => importModule<LayoutModule>(layoutFile))
  );
  const middlewareModules = await Promise.all(
    found.middlewareFiles.map((middlewareFile) => importModule<MiddlewareModule>(middlewareFile))
  );
  const errorModules = await Promise.all(
    found.errorFiles.map((errorFile) => importModule<ErrorModule>(errorFile))
  );

  const hydrate = page.component?.__metadata?.hydrate ?? "island";

  return {
    path: found.path,
    params: match?.result.params ?? {},
    component: page.component,
    revalidate: page.revalidate ?? 0,
    hydrate,
    loadData: page.loadData,
    cache: page.cache,
    actions: page.actions ?? {},
    middlewares: middlewareModules
      .map((mod) => mod.middleware)
      .filter((middleware): middleware is RouteMiddleware => {
        return typeof middleware === "function";
      }),
    errorBoundaries: errorModules
      .map((mod) => mod.renderError)
      .filter((renderer): renderer is ErrorBoundaryRenderer => {
        return typeof renderer === "function";
      }),
    head: page.head,
    layouts: layoutModules
      .filter((mod) => typeof mod.renderLayout === "function")
      .map((mod) => ({
        renderLayout: mod.renderLayout as (
          content: string,
          context: { path: string; locale: string }
        ) => string,
        loadLayoutData: mod.loadLayoutData,
        cache: mod.cache,
      })),
  };
}

/** Discovers all `api.ts` files under routesDir and returns their route paths. */
export function discoverApiRoutes(routesDir: string): Array<{ path: string; apiFile: string }> {
  if (!fs.existsSync(routesDir)) return [];

  const results: Array<{ path: string; apiFile: string }> = [];

  function walk(baseDir: string, currentDir: string): void {
    const apiFile = pickFile(currentDir, "api");
    if (apiFile) {
      const relativeDir = path.relative(baseDir, currentDir);
      results.push({ path: toRoutePath(relativeDir), apiFile });
    }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isDirectory()) walk(baseDir, path.join(currentDir, entry.name));
    });
  }

  walk(routesDir, routesDir);
  return results;
}

export type ResolvedApiRoute = {
  params: Record<string, string | string[]>;
  module: ApiRouteModule;
};

/** Resolves a URL path to an API route module, or returns null if not found. */
export async function resolveApiRoute(
  routePath: string,
  routesDir: string
): Promise<ResolvedApiRoute | null> {
  const normalized = normalizePathname(routePath);
  const apiRoutes = discoverApiRoutes(routesDir);
  const match = apiRoutes
    .map((r) => ({ r, result: matchRoutePath(normalized, r.path) }))
    .find((entry) => entry.result.matched);

  if (!match) return null;

  const mod = await importModule<ApiRouteModule>(match.r.apiFile);
  return { params: match.result.params, module: mod };
}

export function createRouteContext(
  pathname: string,
  locale: string,
  rawQuery = "",
  params: Record<string, string | string[]> = {},
  request?: RouteContext["request"]
): RouteContext {
  const query = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;

  return {
    path: pathname,
    locale,
    searchParams: new URLSearchParams(query),
    params,
    request,
  };
}
