import type { MiddlewareResult } from "../app/core/server-actions";
import { loadRuntimeConfig } from "./runtime-config";

export type RouteRule = {
  from: string;
  rewrite?: string;
  redirect?: {
    to: string;
    status?: 301 | 302 | 307 | 308;
  };
};

export const routeRules: RouteRule[] = [
  { from: "/home", rewrite: "/" },
  { from: "/legacy", redirect: { to: "/login", status: 302 } },
  { from: "/old-blog/*", rewrite: "/blog/:splat" },
];

function getActiveRouteRules(): RouteRule[] {
  const configRules = loadRuntimeConfig().routeRules;
  return configRules && configRules.length > 0 ? configRules : routeRules;
}

function matchRule(
  pathname: string,
  pattern: string,
): { matched: boolean; splat?: string } {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const splat = pathname.slice(prefix.length).replace(/^\//, "");
      return { matched: true, splat };
    }

    return { matched: false };
  }

  return { matched: pathname === pattern };
}

function fillTarget(
  target: string,
  match: { matched: boolean; splat?: string },
): string {
  if (target.includes(":splat")) {
    return target.replace(":splat", match.splat ?? "");
  }

  return target;
}

export function applyRouteRules(pathname: string): MiddlewareResult | null {
  for (const rule of getActiveRouteRules()) {
    const match = matchRule(pathname, rule.from);
    if (!match.matched) {
      continue;
    }

    if (rule.rewrite) {
      return {
        type: "rewrite",
        to: fillTarget(rule.rewrite, match),
      };
    }

    if (rule.redirect) {
      return {
        type: "redirect",
        to: fillTarget(rule.redirect.to, match),
        status: rule.redirect.status ?? 302,
      };
    }
  }

  return null;
}
