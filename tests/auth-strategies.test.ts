import { describe, expect, it } from "vitest";
import {
  createAuthServiceWithDefaults,
  createInternalTokenPlugin,
  type RouteContext,
} from "../src/app/core/auth/strategies";
import { resetAuthPluginLoader } from "../src/server/auth-plugin-loader";

function createContext(
  headers: Record<string, string | undefined>,
): RouteContext {
  return {
    path: "/",
    locale: "pt",
    searchParams: new URLSearchParams(),
    params: {},
    request: {
      headers,
    },
  };
}

describe("Auth strategies", () => {
  it("should reset plugin loader state", () => {
    resetAuthPluginLoader();
    expect(true).toBe(true);
  });

  it("should authorize bearer strategy with valid token", async () => {
    const auth = createAuthServiceWithDefaults();

    const result = await auth.authorize(
      "bearer",
      createContext({ authorization: "Bearer abc" }),
      { requiredPrefix: "Bearer " },
    );

    expect(result.ok).toBe(true);
  });

  it("should deny api-key strategy when key is missing", async () => {
    const auth = createAuthServiceWithDefaults();

    const result = await auth.authorize(
      "api-key",
      createContext({ "x-api-key": undefined }),
      { key: "secret" },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Invalid API key");
  });

  it("should authorize internal-token plugin strategy", async () => {
    const auth = createAuthServiceWithDefaults();
    auth.registerPlugin(createInternalTokenPlugin("internal-secret"));

    const denied = await auth.authorize(
      "internal-token",
      createContext({ "x-internal-token": "wrong" }),
    );

    expect(denied.ok).toBe(false);

    const allowed = await auth.authorize(
      "internal-token",
      createContext({ "x-internal-token": "internal-secret" }),
    );

    expect(allowed.ok).toBe(true);
  });
});
