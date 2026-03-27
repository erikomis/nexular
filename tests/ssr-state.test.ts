import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SSRState, SSRStateBuilder, createSSRStateManager } from "../src/server/ssr-state";

describe("SSR State Management", () => {
  let state: SSRState;

  beforeEach(() => {
    state = createSSRStateManager({
      userId: { type: "string" },
      count: { type: "number" },
      isActive: { type: "boolean" },
      createdAt: { type: "date" },
      tags: { type: "array", items: { type: "string" } },
      optionalField: { type: "string", optional: true },
    });
  });

  it("should validate and set state with schema", () => {
    state.setState("userId", "user-123");
    state.setState("count", 42);
    state.setState("isActive", true);
    state.setState("tags", ["tag1", "tag2"]);

    expect(state.getState("userId")).toBe("user-123");
    expect(state.getState("count")).toBe(42);
    expect(state.getState("isActive")).toBe(true);
    expect(state.getState("tags")).toEqual(["tag1", "tag2"]);
  });

  it("should reject invalid types", () => {
    expect(() => state.setState("count", "not-a-number")).toThrow();
    expect(() => state.setState("isActive", "not-a-boolean")).toThrow();
    expect(() => state.setState("tags", "not-an-array")).toThrow();
  });

  it("should reject required fields when undefined", () => {
    expect(() => state.setState("userId", undefined)).toThrow();
    expect(() => state.setState("count", null)).toThrow();
  });

  it("should allow optional fields to be undefined", () => {
    state.setState("optionalField", undefined);
    expect(state.getState("optionalField")).toBeUndefined();

    state.setState("optionalField", "value");
    expect(state.getState("optionalField")).toBe("value");
  });

  it("should serialize state to JSON", () => {
    state.setState("userId", "user-123");
    state.setState("count", 99);
    state.setState("isActive", false);
    state.setState("createdAt", new Date("2026-03-26T12:00:00Z"));
    state.setState("tags", ["a", "b"]);

    const serialized = state.serialize();
    const parsed = JSON.parse(serialized);

    expect(parsed.userId).toBe("user-123");
    expect(parsed.count).toBe(99);
    expect(parsed.isActive).toBe(false);
    expect(typeof parsed.createdAt).toBe("string");
    expect(parsed.tags).toEqual(["a", "b"]);
  });

  it("should hydrate from serialized state", () => {
    const original = createSSRStateManager({
      userId: { type: "string" },
      count: { type: "number" },
      createdAt: { type: "date" },
    });

    original.setState("userId", "user-456");
    original.setState("count", 77);
    original.setState("createdAt", new Date("2026-03-26T12:00:00Z"));

    const serialized = original.serialize();

    const hydrated = createSSRStateManager({
      userId: { type: "string" },
      count: { type: "number" },
      createdAt: { type: "date" },
    });

    hydrated.hydrate(serialized);

    expect(hydrated.getState("userId")).toBe("user-456");
    expect(hydrated.getState("count")).toBe(77);
    expect(hydrated.getState("createdAt")).toEqual(new Date("2026-03-26T12:00:00Z"));
  });

  it("should create state snapshots", () => {
    state.setState("userId", "user-789");
    state.setState("count", 50);
    state.setState("isActive", true);
    state.setState("tags", ["x", "y"]);

    const snapshot = state.snapshot(["userId", "count"]);

    expect(snapshot).toEqual({
      userId: "user-789",
      count: 50,
    });
    expect(snapshot.isActive).toBeUndefined();
  });

  it("should merge partial state", () => {
    state.setState("userId", "user-111");
    state.setState("count", 10);
    state.setState("isActive", false);

    state.merge({
      count: 20,
      tags: ["updated"],
    });

    expect(state.getState("userId")).toBe("user-111");
    expect(state.getState("count")).toBe(20);
    expect(state.getState("tags")).toEqual(["updated"]);
  });

  it("should use SSRStateBuilder fluent API", () => {
    const builder = new SSRStateBuilder();
    const builtState = builder
      .addString("name")
      .addNumber("age")
      .addBoolean("verified", true)
      .addDate("registeredAt", true)
      .build();

    builtState.setState("name", "John");
    builtState.setState("age", 30);

    expect(builtState.getState("name")).toBe("John");
    expect(builtState.getState("age")).toBe(30);
  });

  it("should support custom serializers", () => {
    const customState = new SSRStateBuilder()
      .addCustom(
        "customData",
        (value) => Buffer.from(JSON.stringify(value)).toString("base64"),
        (value) => JSON.parse(Buffer.from(value, "base64").toString("utf8"))
      )
      .build();

    customState.setState("customData", { key: "value" });
    const serialized = customState.serialize();

    // Check that the data is valid JSON and contains base64-encoded content
    const parsed = JSON.parse(serialized);
    expect(parsed.customData).toBeDefined();

    // Verify it's base64 (no spaces, only base64 chars)
    expect(parsed.customData).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);

    // Verify we can deserialize it back
    const original = JSON.parse(Buffer.from(parsed.customData, "base64").toString("utf8"));
    expect(original.key).toBe("value");
  });

  it("should handle nested arrays with typed items", () => {
    const arrayState = createSSRStateManager({
      items: {
        type: "array",
        items: { type: "number" },
      },
    });

    arrayState.setState("items", [1, 2, 3, 4, 5]);
    expect(arrayState.getState("items")).toEqual([1, 2, 3, 4, 5]);

    expect(() => arrayState.setState("items", [1, "two", 3])).toThrow();
  });
});
