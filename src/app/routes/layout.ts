import type { RouteContext } from "../core/server-actions";

export function renderLayout(
  content: string,
  context: { path: string; locale: string },
): string {
  return `<main data-nx-layout="root" data-path="${context.path}" data-locale="${context.locale}">${content}</main>`;
}

export const cache = {
  ttl: 60,
};

export function loadLayoutData(ctx: RouteContext) {
  return {
    brand: ctx.locale === "en" ? "Nexular Framework" : "Framework Nexular",
  };
}
