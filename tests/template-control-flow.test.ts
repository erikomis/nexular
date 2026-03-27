import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/app/core/renderer";

describe("Template modern control flow", () => {
  it("should render @if/@else blocks", () => {
    const template = "@if (isAdmin) {<p>Admin</p>} @else {<p>User</p>}";

    const adminHtml = renderTemplate(template, { isAdmin: true });
    const userHtml = renderTemplate(template, { isAdmin: false });

    expect(adminHtml).toContain("Admin");
    expect(adminHtml).not.toContain("User");

    expect(userHtml).toContain("User");
    expect(userHtml).not.toContain("Admin");
  });

  it("should render @if/@else if/@else chain", () => {
    const template =
      "@if (isLoading) {<p>Loading</p>} @else if (isEmpty) {<p>Empty</p>} @else {<p>Done</p>}";

    const html = renderTemplate(template, {
      isLoading: false,
      isEmpty: true,
    });

    expect(html).toContain("Empty");
    expect(html).not.toContain("Loading");
    expect(html).not.toContain("Done");
  });

  it("should render @for list blocks", () => {
    const template = "<ul>@for (item of items) {<li>{{ item }}</li>}</ul>";
    const html = renderTemplate(template, { items: ["A", "B", "C"] });

    expect(html).toContain("<li>A</li>");
    expect(html).toContain("<li>B</li>");
    expect(html).toContain("<li>C</li>");
  });

  it("should support @for with track clause", () => {
    const template = "@for (item of items; track item.id) {<p>{{ item.name }}</p>}";

    const html = renderTemplate(template, {
      items: [{ id: 1, name: "Erik" }],
    });

    expect(html).toContain("Erik");
  });

  it("should support unary negation in @if conditions", () => {
    const template = "@if (!isReady) {<p>Not ready</p>} @else {<p>Ready</p>}";
    const html = renderTemplate(template, { isReady: false });

    expect(html).toContain("Not ready");
    expect(html).not.toContain("Ready</p>");
  });
});
