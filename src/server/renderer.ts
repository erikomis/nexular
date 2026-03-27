import { bootstrap, container, I18nService, renderComponentSSR } from "../app/core";
import { AppModule } from "../app/app.module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ActionCachePolicy,
  CachePolicy,
  DataLoader,
  ErrorBoundaryRenderer,
  HeadProvider,
  MiddlewareResult,
  PageHead,
  RouteContext,
  RouteMiddleware,
} from "../app/core/server-actions";
import { NotFoundError, RedirectError } from "../app/core/server-actions";
import { createRouteContext, resolveMiddlewaresForPath, resolveRoute } from "./file-router";
import { formatPublicErrorMessage, isProductionLike, logStructured } from "./logger";
import { applyRouteRules } from "./route-rules";
import { createSSRStateManager } from "./ssr-state";
import { createProgressiveRenderer } from "./streaming-ssr";

let initialized = false;
let resolvedBootstrapModule: any | null = null;
let resolvedExternalAppRoutes: AppRouteConfig[] | null | undefined;
const loadedExternalModules = new Set<string>();

type AppRouteConfig = {
  path: string;
  loadModule?: () => Promise<unknown>;
  data?: Record<string, unknown>;
};

export type RenderedDocument = {
  status: number;
  head: string;
  body: string;
  tail: string;
  revalidate: number;
  headers?: Record<string, string>;
  diagnostics?: {
    message: string;
    stack?: string;
    path: string;
  };
};

export type RenderFeatureFlags = {
  sharedState: boolean;
  streamingSSR: boolean;
};

export type RenderOptions = {
  features?: Partial<RenderFeatureFlags>;
};

type CacheEntry = {
  expiresAt: number;
  value: RenderedDocument;
  route: string;
  tags: Set<string>;
};

const htmlCache = new Map<string, CacheEntry>();
const dataCache = new Map<
  string,
  { expiresAt: number; value: unknown; route: string; tags: Set<string> }
>();
const actionCache = new Map<
  string,
  { expiresAt: number; value: unknown; route: string; tags: Set<string> }
>();

export type CacheInvalidationScope = "html" | "data" | "action" | "all";

export type ServerCacheStats = {
  htmlEntries: number;
  dataEntries: number;
  actionEntries: number;
};

function resolveRoutesDir(): string {
  const externalRoot = process.env.NEXULAR_APP_ROOT;
  if (externalRoot) {
    return path.resolve(externalRoot, "app/routes");
  }

  return path.join(__dirname, "../app/routes");
}

function resolveExternalAppModulePath(): string | null {
  const externalRoot = process.env.NEXULAR_APP_ROOT;
  if (!externalRoot) {
    return null;
  }

  const appRoot = path.resolve(externalRoot, "app");
  const tsPath = path.join(appRoot, "app.module.ts");
  const jsPath = path.join(appRoot, "app.module.js");

  if (fs.existsSync(tsPath)) return tsPath;
  if (fs.existsSync(jsPath)) return jsPath;
  return null;
}

function resolveExternalAppRoutesPath(): string | null {
  const externalRoot = process.env.NEXULAR_APP_ROOT;
  if (!externalRoot) {
    return null;
  }

  const appRoot = path.resolve(externalRoot, "app");
  const tsPath = path.join(appRoot, "app.routes.ts");
  const jsPath = path.join(appRoot, "app.routes.js");

  if (fs.existsSync(tsPath)) return tsPath;
  if (fs.existsSync(jsPath)) return jsPath;
  return null;
}

async function importExternalAppModule(filePath: string): Promise<any> {
  if (filePath.endsWith(".js")) {
    return require(filePath);
  }

  const fileUrl = pathToFileURL(filePath).href;
  return await import(fileUrl);
}

async function importExternalRoutesModule(filePath: string): Promise<any> {
  if (filePath.endsWith(".js")) {
    return require(filePath);
  }

  const fileUrl = pathToFileURL(filePath).href;
  return await import(fileUrl);
}

function normalizeExternalRoutePath(value: string): string {
  if (!value || value === "/") {
    return "/";
  }

  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

function canMatchByPrefix(pathname: string, routePath: string): boolean {
  if (routePath === "/") {
    return true;
  }

  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

function findExternalRouteMatch(pathname: string, routes: AppRouteConfig[]): AppRouteConfig | null {
  const normalizedPathname = normalizePath(pathname);
  let bestMatch: AppRouteConfig | null = null;
  let bestLength = -1;

  for (const route of routes) {
    const normalizedRoutePath = normalizeExternalRoutePath(route.path);
    if (!canMatchByPrefix(normalizedPathname, normalizedRoutePath)) {
      continue;
    }

    if (normalizedRoutePath.length > bestLength) {
      bestLength = normalizedRoutePath.length;
      bestMatch = route;
    }
  }

  return bestMatch;
}

async function resolveExternalAppRoutes(): Promise<AppRouteConfig[] | null> {
  if (resolvedExternalAppRoutes !== undefined) {
    return resolvedExternalAppRoutes;
  }

  const routeMapPath = resolveExternalAppRoutesPath();
  if (!routeMapPath) {
    resolvedExternalAppRoutes = null;
    return resolvedExternalAppRoutes;
  }

  try {
    const imported = await importExternalRoutesModule(routeMapPath);
    const routeMap =
      imported?.appRoutes ?? imported?.default?.appRoutes ?? imported?.default ?? null;

    resolvedExternalAppRoutes = Array.isArray(routeMap)
      ? routeMap.filter((route): route is AppRouteConfig => {
          return typeof route?.path === "string";
        })
      : null;
  } catch {
    resolvedExternalAppRoutes = null;
  }

  return resolvedExternalAppRoutes;
}

async function preloadExternalRouteModule(pathname: string): Promise<void> {
  const externalRoutes = await resolveExternalAppRoutes();
  if (!externalRoutes || externalRoutes.length === 0) {
    return;
  }

  const matchedRoute = findExternalRouteMatch(pathname, externalRoutes);
  if (!matchedRoute?.loadModule) {
    return;
  }

  const routeKey = normalizeExternalRoutePath(matchedRoute.path);
  if (loadedExternalModules.has(routeKey)) {
    return;
  }

  try {
    await matchedRoute.loadModule();
    loadedExternalModules.add(routeKey);
  } catch (error) {
    logStructured("warn", "renderer.external_route_module_preload_failed", {
      path: pathname,
      route: routeKey,
      errorMessage: error instanceof Error ? error.message : "Unknown preload failure",
    });
  }
}

async function resolveBootstrapModule(): Promise<any> {
  if (resolvedBootstrapModule) {
    return resolvedBootstrapModule;
  }

  const externalModulePath = resolveExternalAppModulePath();
  if (!externalModulePath) {
    resolvedBootstrapModule = AppModule;
    return resolvedBootstrapModule;
  }

  try {
    const imported = await importExternalAppModule(externalModulePath);
    const moduleClass =
      imported?.AppModule ?? imported?.default?.AppModule ?? imported?.default ?? null;

    resolvedBootstrapModule = moduleClass || AppModule;
  } catch {
    resolvedBootstrapModule = AppModule;
  }

  return resolvedBootstrapModule;
}

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    const moduleClass = await resolveBootstrapModule();
    bootstrap(moduleClass);
    await bridgeExternalFrameworkContainer();
    initialized = true;
  }
}

async function bridgeExternalFrameworkContainer(): Promise<void> {
  if (!process.env.NEXULAR_APP_ROOT) {
    return;
  }

  try {
    const distContainerModulePath = pathToFileURL(
      path.join(__dirname, "../../dist/app/core/di/container.js")
    ).href;
    const distI18nModulePath = pathToFileURL(
      path.join(__dirname, "../../dist/app/core/mcp/i18n.js")
    ).href;

    const [distContainerModule, distI18nModule] = await Promise.all([
      import(distContainerModulePath),
      import(distI18nModulePath),
    ]);

    const distContainer = distContainerModule?.container as
      | {
          has: (token: unknown) => boolean;
          register: (token: unknown, instance: unknown) => void;
        }
      | undefined;
    const DistI18nService = distI18nModule?.I18nService as
      | (new (translations?: unknown, locale?: string) => { getLocale?: () => string })
      | undefined;

    if (!distContainer || !DistI18nService) {
      return;
    }

    if (!distContainer.has(DistI18nService)) {
      const currentLocale = container.has(I18nService)
        ? container.resolve<I18nService>(I18nService).getLocale()
        : "pt";

      distContainer.register(DistI18nService, new DistI18nService(undefined, currentLocale));
    }
  } catch {
    // Best-effort bridge for mixed source/dist runtime in local development.
  }
}

function withLayouts(
  content: string,
  layouts: Array<{
    renderLayout: (content: string, context: { path: string; locale: string }) => string;
  }>,
  context: { path: string; locale: string }
): string {
  return layouts.reduce((acc, layout) => layout.renderLayout(acc, context), content);
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHeadHtml(head: PageHead, locale: string): string {
  const charset = head.charset ?? "utf-8";
  const viewport = head.viewport ?? "width=device-width, initial-scale=1";
  const title = head.title ?? "Nexular App";

  const parts: string[] = [
    `<!doctype html>`,
    `<html lang="${escapeAttr(locale)}">`,
    `<head>`,
    `<meta charset="${escapeAttr(charset)}">`,
    `<meta name="viewport" content="${escapeAttr(viewport)}">`,
    `<title>${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>`,
  ];

  if (head.description) {
    parts.push(`<meta name="description" content="${escapeAttr(head.description)}">`);
  }

  if (head.canonical) {
    parts.push(`<link rel="canonical" href="${escapeAttr(head.canonical)}">`);
  }

  if (head.og) {
    const og = head.og;
    if (og.title) parts.push(`<meta property="og:title" content="${escapeAttr(og.title)}">`);
    if (og.description)
      parts.push(`<meta property="og:description" content="${escapeAttr(og.description)}">`);
    if (og.image) parts.push(`<meta property="og:image" content="${escapeAttr(og.image)}">`);
    if (og.type) parts.push(`<meta property="og:type" content="${escapeAttr(og.type)}">`);
    if (og.url) parts.push(`<meta property="og:url" content="${escapeAttr(og.url)}">`);
  }

  if (head.meta) {
    for (const m of head.meta) {
      if (m.name)
        parts.push(`<meta name="${escapeAttr(m.name)}" content="${escapeAttr(m.content)}">`);
      else if (m.property)
        parts.push(
          `<meta property="${escapeAttr(m.property)}" content="${escapeAttr(m.content)}">`
        );
    }
  }

  if (head.link) {
    for (const l of head.link) {
      const attrs = Object.entries(l)
        .map(([k, v]) => `${escapeAttr(k)}="${escapeAttr(v)}"`)
        .join(" ");
      parts.push(`<link ${attrs}>`);
    }
  }

  parts.push(`</head>`, `<body>`);
  return parts.join("\n");
}

function buildServerTransitionStyleTag(): string {
  const css = [
    "<style data-nx-server-transition>",
    ":root {",
    "  --nx-ssr-enter-ms: 360ms;",
    "  --nx-ssr-leave-ms: 180ms;",
    "  --nx-ssr-ease: cubic-bezier(0.2, 0.8, 0.2, 1);",
    "}",
    "body[data-nx-ready='false'] app-root {",
    "  opacity: 0;",
    "  transform: translateY(12px);",
    "  filter: blur(2px);",
    "}",
    "body[data-nx-ready='true'] app-root {",
    "  animation: nxSsrEnter var(--nx-ssr-enter-ms) var(--nx-ssr-ease) both;",
    "}",
    "body[data-nx-leaving='true'] app-root {",
    "  animation: nxSsrLeave var(--nx-ssr-leave-ms) ease-in forwards;",
    "}",
    "@keyframes nxSsrEnter {",
    "  0% { opacity: 0; transform: translateY(12px); filter: blur(2px); }",
    "  100% { opacity: 1; transform: translateY(0); filter: blur(0); }",
    "}",
    "@keyframes nxSsrLeave {",
    "  0% { opacity: 1; transform: translateY(0); filter: blur(0); }",
    "  100% { opacity: 0; transform: translateY(7px); filter: blur(1px); }",
    "}",
    "</style>",
  ];

  return css.join("\n");
}

function buildServerTransitionScriptTag(): string {
  const script = [
    "<script>",
    "(() => {",
    "  if (typeof window === 'undefined' || typeof document === 'undefined') return;",
    "  const body = document.body;",
    "  if (!body) return;",
    "  body.setAttribute('data-nx-ready', 'false');",
    "  const markReady = () => {",
    "    body.setAttribute('data-nx-ready', 'true');",
    "  };",
    "  if (document.readyState === 'complete' || document.readyState === 'interactive') {",
    "    requestAnimationFrame(markReady);",
    "  } else {",
    "    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(markReady), { once: true });",
    "  }",
    "  document.addEventListener('click', (event) => {",
    "    const target = event.target;",
    "    if (!(target instanceof Element)) return;",
    "    const anchor = target.closest('a[href]');",
    "    if (!(anchor instanceof HTMLAnchorElement)) return;",
    "    if (anchor.target && anchor.target !== '_self') return;",
    "    if (anchor.hasAttribute('download')) return;",
    "    const href = anchor.getAttribute('href');",
    "    if (!href || href.startsWith('#')) return;",
    "    const nextUrl = new URL(anchor.href, window.location.origin);",
    "    if (nextUrl.origin !== window.location.origin) return;",
    "    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;",
    "    body.setAttribute('data-nx-leaving', 'true');",
    "  });",
    "  window.addEventListener('pageshow', () => {",
    "    body.setAttribute('data-nx-leaving', 'false');",
    "  });",
    "})();",
    "</script>",
  ];

  return script.join("\n");
}

async function resolvePageHead(
  headDef: PageHead | HeadProvider | undefined,
  ctx: RouteContext,
  data: unknown
): Promise<PageHead> {
  if (!headDef) return {};
  if (typeof headDef === "function") return headDef(ctx, data);
  return headDef;
}

function cacheKey(pathname: string, locale: string): string {
  return `${locale}:${pathname}`;
}

function normalizePath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  if (pathname === "/") {
    return pathname;
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeTags(tags: string[]): Set<string> {
  const normalized = new Set<string>();

  tags.forEach((tag) => {
    const clean = tag.trim();
    if (clean.length > 0) {
      normalized.add(clean);
    }
  });

  return normalized;
}

function resolvePolicyKey(
  policy: CachePolicy | ActionCachePolicy<any>,
  fallback: string,
  ctx: RouteContext,
  input?: unknown
): string {
  const key = policy.key;

  if (typeof key === "string") {
    return key;
  }

  if (typeof key === "function") {
    const maybeInputKey =
      key.length >= 2
        ? (key as (i: unknown, c: RouteContext) => string)(input, ctx)
        : (key as (c: RouteContext) => string)(ctx);
    return maybeInputKey;
  }

  return fallback;
}

function resolvePolicyTags(
  policy: CachePolicy | ActionCachePolicy<any>,
  ctx: RouteContext,
  input?: unknown
): string[] {
  const tags = policy.tags;

  if (Array.isArray(tags)) {
    return tags;
  }

  if (typeof tags === "function") {
    const maybeInputTags =
      tags.length >= 2
        ? (tags as (i: unknown, c: RouteContext) => string[])(input, ctx)
        : (tags as (c: RouteContext) => string[])(ctx);
    return maybeInputTags;
  }

  return [];
}

async function loadDataWithCache<T>(
  loader: DataLoader<T> | undefined,
  policy: CachePolicy | undefined,
  cacheNamespace: string,
  ctx: RouteContext
): Promise<T | undefined> {
  if (!loader) {
    return undefined;
  }

  if (!policy || policy.ttl <= 0) {
    return await loader(ctx);
  }

  const key = resolvePolicyKey(
    policy,
    `${cacheNamespace}:${ctx.locale}:${ctx.path}:${ctx.searchParams.toString()}`,
    ctx
  );
  const routeTag = `route:${normalizePath(ctx.path)}`;
  const tags = normalizeTags([routeTag, ...resolvePolicyTags(policy, ctx)]);
  const entry = dataCache.get(key);

  if (entry && entry.expiresAt > Date.now()) {
    return entry.value as T;
  }

  const value = await loader(ctx);
  dataCache.set(key, {
    value,
    expiresAt: Date.now() + policy.ttl * 1000,
    route: normalizePath(ctx.path),
    tags,
  });

  return value;
}

function tryGetCache(pathname: string, locale: string): RenderedDocument | null {
  const key = cacheKey(pathname, locale);
  const entry = htmlCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    htmlCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCache(
  pathname: string,
  locale: string,
  value: RenderedDocument,
  tags: string[] = []
): void {
  if (value.revalidate <= 0) {
    return;
  }

  const normalizedPath = normalizePath(pathname);

  htmlCache.set(cacheKey(pathname, locale), {
    value,
    expiresAt: Date.now() + value.revalidate * 1000,
    route: normalizedPath,
    tags: normalizeTags([`route:${normalizedPath}`, ...tags]),
  });
}

function pruneExpiredEntries<T extends { expiresAt: number }>(cache: Map<string, T>): void {
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function invalidateByRoute<T extends { route: string }>(
  cache: Map<string, T>,
  pathname: string
): number {
  let removed = 0;
  const normalized = normalizePath(pathname);

  for (const [key, entry] of cache.entries()) {
    if (entry.route === normalized) {
      cache.delete(key);
      removed += 1;
    }
  }

  return removed;
}

function invalidateByTag<T extends { tags: Set<string> }>(
  cache: Map<string, T>,
  tag: string
): number {
  let removed = 0;
  const normalizedTag = tag.trim();

  if (!normalizedTag) {
    return removed;
  }

  for (const [key, entry] of cache.entries()) {
    if (entry.tags.has(normalizedTag)) {
      cache.delete(key);
      removed += 1;
    }
  }

  return removed;
}

function shouldAffectScope(
  scope: CacheInvalidationScope,
  target: Exclude<CacheInvalidationScope, "all">
): boolean {
  return scope === "all" || scope === target;
}

export function invalidateRouteCache(
  pathname: string,
  scope: CacheInvalidationScope = "all"
): number {
  let removed = 0;

  if (shouldAffectScope(scope, "html")) {
    removed += invalidateByRoute(htmlCache, pathname);
  }

  if (shouldAffectScope(scope, "data")) {
    removed += invalidateByRoute(dataCache, pathname);
  }

  if (shouldAffectScope(scope, "action")) {
    removed += invalidateByRoute(actionCache, pathname);
  }

  return removed;
}

export function invalidateTagCache(tag: string, scope: CacheInvalidationScope = "all"): number {
  let removed = 0;

  if (shouldAffectScope(scope, "html")) {
    removed += invalidateByTag(htmlCache, tag);
  }

  if (shouldAffectScope(scope, "data")) {
    removed += invalidateByTag(dataCache, tag);
  }

  if (shouldAffectScope(scope, "action")) {
    removed += invalidateByTag(actionCache, tag);
  }

  return removed;
}

export function clearServerCaches(scope: CacheInvalidationScope = "all"): void {
  if (shouldAffectScope(scope, "html")) {
    htmlCache.clear();
  }

  if (shouldAffectScope(scope, "data")) {
    dataCache.clear();
  }

  if (shouldAffectScope(scope, "action")) {
    actionCache.clear();
  }
}

export function getServerCacheStats(): ServerCacheStats {
  pruneExpiredEntries(htmlCache);
  pruneExpiredEntries(dataCache);
  pruneExpiredEntries(actionCache);

  return {
    htmlEntries: htmlCache.size,
    dataEntries: dataCache.size,
    actionEntries: actionCache.size,
  };
}

async function runMiddlewares(
  middlewares: RouteMiddleware[],
  context: RouteContext
): Promise<MiddlewareResult | null> {
  for (const middleware of middlewares) {
    const result = await middleware(context);

    if (!result || result.type === "continue") {
      continue;
    }

    return result;
  }

  return null;
}

function renderErrorBoundary(
  error: unknown,
  context: RouteContext,
  boundaries: ErrorBoundaryRenderer[]
): string {
  const nearestBoundary = boundaries.length > 0 ? boundaries[boundaries.length - 1] : undefined;

  if (!nearestBoundary) {
    const message = formatPublicErrorMessage(error);
    const safeMessage = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const details =
      !isProductionLike() && error instanceof Error && error.stack
        ? `<details style="margin-top:12px"><summary>Detalhes tecnicos</summary><pre style="white-space:pre-wrap;line-height:1.4;margin-top:8px">${error.stack
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</pre></details>`
        : "";

    return `<section data-nx-error-boundary="default"><h1>Erro interno</h1><p>${safeMessage}</p>${details}</section>`;
  }

  return nearestBoundary({ error, context });
}

function resolveFeatureFlags(options?: RenderOptions): RenderFeatureFlags {
  const envSharedState = process.env.NEXULAR_FEATURE_SHARED_STATE;
  const envStreaming = process.env.NEXULAR_FEATURE_SSR_STREAMING;

  const sharedStateDefault = envSharedState ? envSharedState !== "false" : true;
  const streamingDefault = envStreaming ? envStreaming !== "false" : true;

  return {
    sharedState: options?.features?.sharedState ?? sharedStateDefault,
    streamingSSR: options?.features?.streamingSSR ?? streamingDefault,
  };
}

export async function renderDocument(
  pathname = "/",
  locale = "pt",
  rawQuery = "",
  request?: RouteContext["request"],
  options?: RenderOptions
): Promise<RenderedDocument> {
  await ensureInitialized();
  const featureFlags = resolveFeatureFlags(options);

  const i18n = container.resolve<I18nService>(I18nService);
  i18n.setLocale(locale);

  const routesDir = resolveRoutesDir();
  let activePath = pathname;

  for (let pass = 0; pass < 5; pass += 1) {
    const ruleResult = applyRouteRules(activePath);

    if (ruleResult?.type === "redirect") {
      return {
        status: ruleResult.status ?? 302,
        revalidate: 0,
        head: "",
        body: "",
        tail: "",
        headers: {
          location: ruleResult.to,
        },
      };
    }

    if (ruleResult?.type === "rewrite") {
      activePath = ruleResult.to;
      continue;
    }

    await preloadExternalRouteModule(activePath);

    const candidateRoute = await resolveRoute(activePath, routesDir);
    const candidateMiddlewares = candidateRoute
      ? candidateRoute.middlewares
      : await resolveMiddlewaresForPath(activePath, routesDir);

    if (!candidateRoute && candidateMiddlewares.length === 0) {
      break;
    }

    const candidateContext = createRouteContext(
      activePath,
      locale,
      rawQuery,
      candidateRoute?.params ?? {},
      request
    );

    const middlewareResult = await runMiddlewares(candidateMiddlewares, candidateContext);

    if (!middlewareResult) {
      if (!candidateRoute) {
        break;
      }
      break;
    }

    if (middlewareResult.type === "redirect") {
      return {
        status: middlewareResult.status ?? 302,
        revalidate: 0,
        head: "",
        body: "",
        tail: "",
        headers: {
          location: middlewareResult.to,
        },
      };
    }

    if (middlewareResult.type === "rewrite") {
      activePath = middlewareResult.to;
      continue;
    }
  }

  await preloadExternalRouteModule(activePath);

  const route = await resolveRoute(activePath, routesDir);

  if (!route) {
    const notFoundDoc: RenderedDocument = {
      status: 404,
      revalidate: 0,
      head: buildHeadHtml({ title: "404 — Não encontrado" }, locale),
      body: `<app-root><h1>404</h1><p>Rota nao encontrada: ${activePath}</p></app-root>`,
      tail: "</body></html>",
    };
    return notFoundDoc;
  }

  const context = createRouteContext(activePath, locale, rawQuery, route.params, request);

  const cached = tryGetCache(pathname, locale);
  if (cached) {
    return cached;
  }

  let result: RenderedDocument;

  try {
    const pageData = (await loadDataWithCache(
      route.loadData,
      route.cache,
      `page:${route.path}`,
      context
    )) as Record<string, unknown> | undefined;

    const collectedLayoutData = await Promise.all(
      route.layouts.map(async (layout, index) => {
        return (await loadDataWithCache(
          layout.loadLayoutData,
          layout.cache,
          `layout:${route.path}:${index}`,
          context
        )) as Record<string, unknown> | undefined;
      })
    );

    const layoutData = collectedLayoutData.reduce<Record<string, unknown>>(
      (acc, current) => ({ ...acc, ...(current ?? {}) }),
      {}
    );

    const rendered = renderComponentSSR(route.component, {
      islandId: `${route.component.name}-root`,
      state: {
        data: pageData ?? {},
        layoutData,
      },
    });

    const contentWithLayouts = withLayouts(rendered.html, route.layouts, {
      path: activePath,
      locale,
    });

    const hydrationPayload = {
      locale,
      islands:
        rendered.hydrate === "none"
          ? []
          : [
              {
                selector: `[data-nx-island-id="${rendered.islandId}"]`,
                component: rendered.componentKey,
                template:
                  typeof route.component?.__metadata?.template === "string"
                    ? route.component.__metadata.template
                    : undefined,
                state: rendered.state,
              },
            ],
    };

    const sharedState = createSSRStateManager({
      locale: { type: "string" },
      route: { type: "string" },
      data: { type: "json", optional: true },
      layoutData: { type: "json", optional: true },
      hydration: { type: "json", optional: true },
    });
    sharedState.setState("locale", locale);
    sharedState.setState("route", activePath);
    sharedState.setState("data", pageData ?? {});
    sharedState.setState("layoutData", layoutData);
    sharedState.setState("hydration", hydrationPayload);

    const serializedSharedState = sharedState.serialize();
    const safeHydrationPayload = JSON.stringify(hydrationPayload).replace(/</g, "\\u003c");
    const safeSharedState = serializedSharedState.replace(/</g, "\\u003c");

    const resolvedHead = await resolvePageHead(route.head, context, pageData);
    const shouldHydrate = rendered.hydrate !== "none";
    const head = `${buildHeadHtml(resolvedHead, locale)}\n${buildServerTransitionStyleTag()}`;
    const body = `<app-root>${contentWithLayouts}</app-root>`;

    const sharedStateScript = featureFlags.sharedState
      ? `<script>window.__NEXULAR_STATE__=${safeSharedState};</script>`
      : "";
    const serverTransitionScript = buildServerTransitionScriptTag();
    const hydrationScript = shouldHydrate
      ? `<script>window.__NEXULAR_HYDRATION__=${safeHydrationPayload};</script><script type="module" src="/client/main.js"></script>`
      : "";

    if (featureFlags.streamingSSR) {
      const pipeline = createProgressiveRenderer();
      pipeline.addStage("shell", () => body, "critical");

      if (sharedStateScript) {
        pipeline.addStage("shared-state", () => sharedStateScript, "high");
      }

      pipeline.addStage("server-transition", () => serverTransitionScript, "high");

      if (hydrationScript) {
        pipeline.addStage("hydration", () => hydrationScript, "normal");
      }

      const streamedChunks: string[] = [];
      for await (const chunk of pipeline.executeStreaming()) {
        if (chunk.type === "shell" || chunk.type === "partial" || chunk.type === "script") {
          streamedChunks.push(chunk.content);
        }
      }

      result = {
        status: 200,
        revalidate: route.revalidate,
        head,
        body: streamedChunks.join(""),
        tail: "</body></html>",
      };
    } else {
      const tail = `${serverTransitionScript}${sharedStateScript}${hydrationScript}</body></html>`;

      result = {
        status: 200,
        revalidate: route.revalidate,
        head,
        body,
        tail,
      };
    }
  } catch (error) {
    if (error instanceof RedirectError) {
      result = {
        status: error.redirectStatus,
        revalidate: 0,
        head: "",
        body: "",
        tail: "",
        headers: { location: error.to },
      };
    } else if (error instanceof NotFoundError) {
      result = {
        status: 404,
        revalidate: 0,
        head: buildHeadHtml({ title: "404 — Não encontrado" }, locale),
        body: `<app-root><h1>404</h1><p>${error.message}</p></app-root>`,
        tail: "</body></html>",
      };
    } else {
      const diagnostics = {
        path: activePath,
        message: error instanceof Error ? error.message : "Unknown rendering error",
        stack: isProductionLike() ? undefined : error instanceof Error ? error.stack : undefined,
      };

      logStructured("error", "renderer.render_failed", {
        path: diagnostics.path,
        locale,
        errorMessage: diagnostics.message,
        stack: diagnostics.stack,
      });

      const boundaryHtml = renderErrorBoundary(error, context, route.errorBoundaries);

      result = {
        status: 500,
        revalidate: 0,
        head: buildHeadHtml({ title: "500 — Erro interno" }, locale),
        body: `<app-root>${boundaryHtml}</app-root>`,
        tail: "</body></html>",
        diagnostics,
      };
    }
  }

  const routeCacheTags = route.cache ? resolvePolicyTags(route.cache, context) : [];
  setCache(pathname, locale, result, routeCacheTags);
  return result;
}

export async function renderToString(
  pathname = "/",
  locale = "pt",
  options?: RenderOptions
): Promise<string> {
  const result = await renderDocument(pathname, locale, "", undefined, options);
  return `${result.head}${result.body}${result.tail}`;
}

export async function invokeRouteAction<Input, Output>(params: {
  pathname: string;
  locale?: string;
  rawQuery?: string;
  action: string;
  input: Input;
  request?: RouteContext["request"];
}): Promise<Output> {
  await ensureInitialized();

  const locale = params.locale ?? "pt";
  const routesDir = resolveRoutesDir();
  await preloadExternalRouteModule(params.pathname);
  const route = await resolveRoute(params.pathname, routesDir);

  if (!route) {
    throw new Error(`Route not found: ${params.pathname}`);
  }

  const actionDef = route.actions[params.action];
  if (!actionDef) {
    throw new Error(`Action not found: ${params.action}`);
  }

  const context = createRouteContext(
    params.pathname,
    locale,
    params.rawQuery ?? "",
    route.params,
    params.request
  );

  const validatedInput = actionDef.validate
    ? actionDef.validate(params.input)
    : (params.input as Input);

  if (actionDef.authorize) {
    const authResult = await actionDef.authorize(validatedInput, context);
    if (authResult !== true) {
      const message = typeof authResult === "string" ? authResult : "Action unauthorized";
      throw new Error(message);
    }
  }
  const policy = actionDef.cache;

  if (!policy || policy.ttl <= 0) {
    return (await actionDef.handler(validatedInput, context)) as Output;
  }

  const key = resolvePolicyKey(
    policy,
    `action:${params.pathname}:${params.action}:${JSON.stringify(validatedInput)}`,
    context,
    validatedInput
  );

  const cached = actionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as Output;
  }

  const result = (await actionDef.handler(validatedInput, context)) as Output;
  actionCache.set(key, {
    value: result,
    expiresAt: Date.now() + policy.ttl * 1000,
    route: normalizePath(context.path),
    tags: normalizeTags([
      `route:${normalizePath(context.path)}`,
      `action:${params.action}`,
      ...resolvePolicyTags(policy, context, validatedInput),
    ]),
  });

  return result;
}
