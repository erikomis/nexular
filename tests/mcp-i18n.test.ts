import { describe, expect, it } from "vitest";
import { bootstrap, container, I18nService, MCPService } from "../src/app/core";
import { AppModule } from "../src/app/app.module";

describe("Default MCP + i18n", () => {
  it("should register i18n and mcp during bootstrap", () => {
    bootstrap(AppModule);

    expect(container.has(I18nService)).toBe(true);
    expect(container.has(MCPService)).toBe(true);
  });

  it("should translate with default locale and run MCP", () => {
    bootstrap(AppModule);

    const i18n = container.resolve<I18nService>(I18nService);
    const mcp = container.resolve<MCPService>(MCPService);

    i18n.setLocale("pt");
    expect(i18n.t("hello")).toBe("Ola");

    const result = mcp.run("criar login");
    expect(
      result.generatedFiles.some((file) => file.endsWith("login.component.ts")),
    ).toBe(true);
    expect(result.i18nKeys).toContain("login.title");
  });
});
