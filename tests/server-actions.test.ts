import { describe, expect, it } from "vitest";
import { invokeRouteAction } from "../src/server/renderer";

describe("Server actions", () => {
  it("should fail for unknown action on an existing route", async () => {
    await expect(
      invokeRouteAction({
        pathname: "/",
        action: "unknownAction",
        input: {},
      })
    ).rejects.toThrow("Action not found");
  });

  it("should include the action name in unknown action errors", async () => {
    await expect(
      invokeRouteAction({
        pathname: "/",
        action: "toggleFeature",
        input: { enabled: true },
        locale: "en",
      })
    ).rejects.toThrow("Action not found: toggleFeature");
  });

  it("should fail when route is not found", async () => {
    await expect(
      invokeRouteAction({
        pathname: "/forms",
        action: "submitContact",
        input: {
          name: "Erik",
          email: "erik@example.com",
        },
      })
    ).rejects.toThrow("Route not found: /forms");
  });
});
