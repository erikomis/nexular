import { describe, expect, it } from "vitest";
import { applyRouteRules } from "../src/server/route-rules";
import { resetRuntimeConfigCache } from "../src/server/runtime-config";

describe("Route rules", () => {
  it("should respect env override route rules", () => {
    process.env.NEXULAR_ROUTE_RULES_JSON = JSON.stringify([
      { from: "/tmp", rewrite: "/login" },
    ]);

    resetRuntimeConfigCache();
    const result = applyRouteRules("/tmp");

    expect(result?.type).toBe("rewrite");
    if (result?.type === "rewrite") {
      expect(result.to).toBe("/login");
    }

    delete process.env.NEXULAR_ROUTE_RULES_JSON;
    resetRuntimeConfigCache();
  });

  it("should rewrite home route", () => {
    const result = applyRouteRules("/home");

    expect(result?.type).toBe("rewrite");
    if (result?.type === "rewrite") {
      expect(result.to).toBe("/");
    }
  });

  it("should redirect legacy route", () => {
    const result = applyRouteRules("/legacy");

    expect(result?.type).toBe("redirect");
    if (result?.type === "redirect") {
      expect(result.to).toBe("/login");
      expect(result.status).toBe(302);
    }
  });

  it("should rewrite wildcard old blog route", () => {
    const result = applyRouteRules("/old-blog/core/intro");

    expect(result?.type).toBe("rewrite");
    if (result?.type === "rewrite") {
      expect(result.to).toBe("/blog/core/intro");
    }
  });
});
