import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createActionClient,
  invokeServerAction,
  signal,
} from "../src/app/core";

describe("actions client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should invoke server action and return typed result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { status: "ok" } }),
      })),
    );

    const result = await invokeServerAction<
      { enabled: boolean },
      { status: string }
    >({
      path: "/",
      action: "toggleFeature",
      input: { enabled: true },
    });

    expect(result.status).toBe("ok");
  });

  it("should rollback optimistic update on action failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ ok: false, error: "boom" }),
      })),
    );

    const status = signal("idle");

    const action = createActionClient<{ enabled: boolean }, { status: string }>(
      {
        path: "/",
        action: "toggleFeature",
        optimistic: () => {
          const previous = status();
          status.set("optimistic");
          return () => status.set(previous);
        },
      },
    );

    await expect(action.execute({ enabled: true })).rejects.toThrow("boom");
    expect(status()).toBe("idle");
    expect(action.pending()).toBe(false);
    expect(action.error()).toBe("boom");
  });
});
