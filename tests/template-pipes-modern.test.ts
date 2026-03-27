import { describe, expect, it } from "vitest";
import {
  listTemplatePipes,
  registerTemplatePipe,
  renderTemplate,
  unregisterTemplatePipe,
} from "../src/app/core/renderer";

describe("Template modern pipes", () => {
  it("should support built-in text pipes", () => {
    const html = renderTemplate(
      "{{ name | uppercase }}|{{ name | lowercase }}|{{ name | titlecase }}",
      {
        name: "joao da silva",
      }
    );

    expect(html).toContain("JOAO DA SILVA");
    expect(html).toContain("joao da silva");
    expect(html).toContain("Joao Da Silva");
  });

  it("should support pipe arguments", () => {
    const html = renderTemplate("{{ items | slice:1:3 }}", {
      items: ["a", "b", "c", "d"],
    });

    expect(html).toContain("b,c");
  });

  it("should support pipes in modern bindings", () => {
    const html = renderTemplate(
      '<div [attr.data-id]="id | uppercase" [style.color]="name | lowercase"></div>',
      {
        id: "ab-7",
        name: "RED",
      }
    );

    expect(html).toContain('data-id="AB-7"');
    expect(html).toContain('style="color: red"');
  });

  it("should support custom pipe registration", () => {
    registerTemplatePipe("reverse", (value) =>
      String(value ?? "")
        .split("")
        .reverse()
        .join("")
    );

    const html = renderTemplate("{{ word | reverse }}", {
      word: "angular",
    });

    expect(html).toContain("ralugna");
    expect(listTemplatePipes()).toContain("reverse");

    unregisterTemplatePipe("reverse");
    expect(listTemplatePipes()).not.toContain("reverse");
  });
});
