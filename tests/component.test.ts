import { describe, expect, it } from "vitest";
import { RootComponent } from "../src/app/modules/root/root.component";
import { Component, renderComponent } from "../src/app/core";

@Component({
  selector: "app-template-url-sample",
  templateUrl: "./fixtures/template-url.component.html",
  styleUrls: ["./fixtures/template-url.component.scss"],
  imports: [],
})
class TemplateUrlSampleComponent {
  title = "Template URL works";
}

describe("RootComponent", () => {
  it("should render root template", () => {
    const html = renderComponent(RootComponent);
    expect(html).toContain("Nexular Framework");
    expect(html).toContain("Core framework package ready");
  });

  it("should render deterministic output on repeated calls", () => {
    const first = renderComponent(RootComponent);
    const second = renderComponent(RootComponent);
    expect(second).toBe(first);
  });

  it("should support angular-like templateUrl metadata", () => {
    const html = renderComponent(TemplateUrlSampleComponent);
    expect(html).toContain("Template URL works");
  });
});
