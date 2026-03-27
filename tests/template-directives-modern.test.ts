import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/app/core/renderer";

describe("Template modern directives", () => {
  it("should support @switch/@case/@default", () => {
    const template =
      "@switch (role) { @case ('admin') {<p>Admin</p>} @case ('user') {<p>User</p>} @default {<p>Guest</p>} }";

    const adminHtml = renderTemplate(template, { role: "admin" });
    const guestHtml = renderTemplate(template, { role: "visitor" });

    expect(adminHtml).toContain("Admin");
    expect(adminHtml).not.toContain("Guest");
    expect(guestHtml).toContain("Guest");
  });

  it("should support modern class/style/attr bindings", () => {
    const template =
      '<div class="base" [class.active]="isActive" [class]="extraClasses" [style.color]="color" [style.font-weight]="weight" [attr.data-id]="itemId"></div>';

    const html = renderTemplate(template, {
      isActive: true,
      extraClasses: "x y",
      color: "red",
      weight: 700,
      itemId: "42",
    });

    expect(html).toContain('class="');
    expect(html).toContain("base");
    expect(html).toContain("active");
    expect(html).toContain("x");
    expect(html).toContain("y");
    expect(html).toContain('style="color: red; font-weight: 700"');
    expect(html).toContain('data-id="42"');
    expect(html).not.toContain("[class.active]");
    expect(html).not.toContain("[style.color]");
    expect(html).not.toContain("[attr.data-id]");
  });

  it("should support object syntax in [class] binding", () => {
    const template = '<section [class]="classMap"></section>';

    const html = renderTemplate(template, {
      classMap: {
        card: true,
        hidden: false,
        selected: true,
      },
    });

    expect(html).toContain('class="card selected"');
    expect(html).not.toContain("hidden");
  });

  it("should support shorthand [style] and [attr] bindings", () => {
    const template = '<article [style]="styleMap" [attr]="attrMap"></article>';

    const html = renderTemplate(template, {
      styleMap: {
        color: "tomato",
        "font-size": "14px",
      },
      attrMap: {
        "data-id": 7,
        "aria-label": "card",
      },
    });

    expect(html).toContain('style="color: tomato; font-size: 14px"');
    expect(html).toContain('data-id="7"');
    expect(html).toContain('aria-label="card"');
    expect(html).not.toContain("[style]");
    expect(html).not.toContain("[attr]");
  });
});
