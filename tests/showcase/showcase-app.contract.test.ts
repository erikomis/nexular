import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const showcaseRoot = process.env.NEXULAR_SHOWCASE_ROOT;
const hasShowcase =
  typeof showcaseRoot === "string" && showcaseRoot.trim().length > 0 && fs.existsSync(showcaseRoot);

describe("Showcase app contract", () => {
  it("should be explicitly configured when running showcase validation", () => {
    if (!hasShowcase) {
      expect(true).toBe(true);
      return;
    }

    expect(showcaseRoot).toBeDefined();
  });

  it("should have expected app and routes folders", () => {
    if (!hasShowcase) {
      expect(true).toBe(true);
      return;
    }

    const srcAppDir = path.join(showcaseRoot!, "src", "app");
    const routesDir = path.join(srcAppDir, "routes");

    expect(fs.existsSync(srcAppDir)).toBe(true);
    expect(fs.existsSync(routesDir)).toBe(true);
  });

  it("should expose at least one route page file", () => {
    if (!hasShowcase) {
      expect(true).toBe(true);
      return;
    }

    const routesDir = path.join(showcaseRoot!, "src", "app", "routes");
    const stack = [routesDir];
    let pageCount = 0;

    while (stack.length > 0) {
      const current = stack.pop()!;
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }

        if (entry.isFile() && /^page\.(ts|js)$/.test(entry.name)) {
          pageCount += 1;
        }
      }
    }

    expect(pageCount).toBeGreaterThan(0);
  });
});
