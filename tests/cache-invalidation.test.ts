import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearServerCaches,
  getServerCacheStats,
  invalidateRouteCache,
  invalidateTagCache,
  invokeRouteAction,
  renderDocument,
} from "../src/server/renderer";

describe("Cache invalidation strategies", () => {
  const fixtureRoot = path.join(process.cwd(), "tests", ".tmp-cache-invalidation");
  const fixtureRoutesDir = path.join(fixtureRoot, "app", "routes");
  const fixturePageFile = path.join(fixtureRoutesDir, "page.ts");
  const previousAppRoot = process.env.NEXULAR_APP_ROOT;

  beforeAll(() => {
    fs.mkdirSync(fixtureRoutesDir, { recursive: true });

    fs.writeFileSync(
      fixturePageFile,
      [
        'import { RootComponent } from "../../../../src/app/modules/root/root.component";',
        'import { defineAction } from "../../../../src/app/core/server-actions";',
        "",
        "let dataVersion = 0;",
        "let actionVersion = 0;",
        "",
        "export const component = RootComponent;",
        "export const revalidate = 120;",
        'export const cache = { ttl: 120, tags: ["catalog", "landing"] };',
        "",
        "export function loadData() {",
        "  return { version: ++dataVersion };",
        "}",
        "",
        "export const actions = {",
        "  mutateCatalog: defineAction<{ id: string }, { version: number }>(",
        "    (_input) => ({ version: ++actionVersion }),",
        '    { cache: { ttl: 120, tags: ["catalog", "cart"] } }',
        "  ),",
        "};",
        "",
      ].join("\n"),
      "utf8"
    );

    process.env.NEXULAR_APP_ROOT = fixtureRoot;
  });

  beforeEach(() => {
    clearServerCaches();
  });

  afterAll(() => {
    clearServerCaches();

    if (typeof previousAppRoot === "string") {
      process.env.NEXULAR_APP_ROOT = previousAppRoot;
    } else {
      delete process.env.NEXULAR_APP_ROOT;
    }

    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("should invalidate html/data/action caches by route", async () => {
    await renderDocument("/");
    await invokeRouteAction({
      pathname: "/",
      action: "mutateCatalog",
      input: { id: "1" },
    });

    const before = getServerCacheStats();
    expect(before.htmlEntries).toBe(1);
    expect(before.dataEntries).toBe(1);
    expect(before.actionEntries).toBe(1);

    const removed = invalidateRouteCache("/");
    expect(removed).toBe(3);

    const after = getServerCacheStats();
    expect(after.htmlEntries).toBe(0);
    expect(after.dataEntries).toBe(0);
    expect(after.actionEntries).toBe(0);
  });

  it("should invalidate cache entries by tag without touching non-matching entries", async () => {
    await renderDocument("/");
    await invokeRouteAction({
      pathname: "/",
      action: "mutateCatalog",
      input: { id: "2" },
    });

    const removedTag = invalidateTagCache("catalog", "action");
    expect(removedTag).toBe(1);

    const partial = getServerCacheStats();
    expect(partial.htmlEntries).toBe(1);
    expect(partial.dataEntries).toBe(1);
    expect(partial.actionEntries).toBe(0);

    const removedAllScopes = invalidateTagCache("catalog");
    expect(removedAllScopes).toBe(2);

    const after = getServerCacheStats();
    expect(after.htmlEntries).toBe(0);
    expect(after.dataEntries).toBe(0);
    expect(after.actionEntries).toBe(0);
  });
});
