import { describe, expect, it } from "vitest";
import {
  analyzeTemplateDiagnostics,
  renderTemplate,
  renderTemplateWithDiagnostics,
} from "../src/app/core/renderer";

describe("Template diagnostics and parser errors", () => {
  it("should throw descriptive parser error for malformed @if", () => {
    const template = "@if (isOpen) <p>Missing block</p>";

    expect(() => renderTemplate(template, { isOpen: true })).toThrow(/IF_INVALID_BLOCK/);
    expect(() => renderTemplate(template, { isOpen: true })).toThrow(/line/i);
    expect(() => renderTemplate(template, { isOpen: true })).toThrow(/column/i);
  });

  it("should report diagnostics for invalid bindings and unknown pipes", () => {
    const template = '<div [class.]="isActive">{{ name | missingPipe }}</div>';
    const diagnostics = analyzeTemplateDiagnostics(template);

    expect(diagnostics.some((item) => item.code === "BINDING_INVALID_CLASS_TARGET")).toBe(true);
    expect(diagnostics.some((item) => item.code === "PIPE_UNKNOWN")).toBe(true);
  });

  it("should render with diagnostics output", () => {
    const template = '<p [style.color]="color">{{ name | uppercase }}</p>';
    const result = renderTemplateWithDiagnostics(template, {
      color: "red",
      name: "erik",
    });

    expect(result.html).toContain("ERIK");
    expect(result.html).toContain('style="color: red"');
    expect(result.diagnostics).toHaveLength(0);
  });
});
