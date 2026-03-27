import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  migrateLegacyTemplateContent,
  migrateLegacyTemplatesInProject,
} from "../src/cli/template-migrator";

describe("Legacy template migrator — migrateLegacyTemplateContent", () => {
  it("should convert *if and *for into modern control flow", () => {
    const legacy =
      '<div *if="isOpen"><span>visible</span></div>\n<ul><li *for="let item of items">{{ item }}</li></ul>';

    const result = migrateLegacyTemplateContent(legacy);

    expect(result.replacements).toBe(2);
    expect(result.content).toContain("@if (isOpen)");
    expect(result.content).toContain("@for (item of items)");
    expect(result.content).not.toContain('*if="');
    expect(result.content).not.toContain('*for="');
  });

  it("returns zero replacements for already-modern templates", () => {
    const modern = `@if (ok) { <p>yes</p> } @for (x of xs; track x) { <li>{{ x }}</li> }`;
    const result = migrateLegacyTemplateContent(modern);
    expect(result.replacements).toBe(0);
    expect(result.content).toBe(modern);
  });

  it("preserves other attributes when converting *if", () => {
    const input = `<button class="btn" *if="active" disabled>Click</button>`;
    const { content } = migrateLegacyTemplateContent(input);
    expect(content).toContain("@if (active)");
    expect(content).toContain('class="btn"');
  });

  it("preserves inner content when converting *for", () => {
    const input = `<li *for="let u of users"><strong>{{ u.name }}</strong></li>`;
    const { content } = migrateLegacyTemplateContent(input);
    expect(content).toContain("<strong>{{ u.name }}</strong>");
  });

  it("handles empty template string", () => {
    const { replacements, content } = migrateLegacyTemplateContent("");
    expect(replacements).toBe(0);
    expect(content).toBe("");
  });
});

describe("Legacy template migrator — migrateLegacyTemplatesInProject", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should support dry-run and write mode", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-legacy-migrate-"));
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    const targetFile = path.join(srcDir, "legacy.template.html");
    fs.writeFileSync(targetFile, '<p *if="enabled">ok</p>', "utf8");

    const dryRun = migrateLegacyTemplatesInProject(tempDir, false);
    expect(dryRun.filesChanged).toBe(1);
    expect(fs.readFileSync(targetFile, "utf8")).toContain('*if="enabled"');

    const writeRun = migrateLegacyTemplatesInProject(tempDir, true);
    expect(writeRun.filesChanged).toBe(1);
    expect(writeRun.totalReplacements).toBe(1);
    expect(fs.readFileSync(targetFile, "utf8")).toContain("@if (enabled)");
  });

  it("ignores node_modules, dist, coverage, and .git directories", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-migrate-ignore-"));
    ["node_modules", "dist", "coverage", ".git"].forEach((dir) => {
      fs.mkdirSync(path.join(tempDir, dir), { recursive: true });
      fs.writeFileSync(path.join(tempDir, dir, "file.ts"), '<p *if="x">y</p>');
    });
    fs.writeFileSync(path.join(tempDir, "legit.ts"), '<div *if="z">ok</div>');

    const result = migrateLegacyTemplatesInProject(tempDir, false);
    expect(result.filesChecked).toBe(1);
    expect(result.filesChanged).toBe(1);
  });

  it("scans both .ts and .html files but not .json", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-migrate-ext-"));
    fs.writeFileSync(path.join(tempDir, "a.ts"), '<p *if="x">ts</p>');
    fs.writeFileSync(path.join(tempDir, "b.html"), '<p *if="y">html</p>');
    fs.writeFileSync(path.join(tempDir, "c.json"), '{"key":"value"}');

    const result = migrateLegacyTemplatesInProject(tempDir, false);
    expect(result.filesChecked).toBe(2);
  });

  it("accumulates totalReplacements across multiple files", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-migrate-multi-"));
    fs.writeFileSync(path.join(tempDir, "a.ts"), '<p *if="a">a</p><p *if="b">b</p>');
    fs.writeFileSync(path.join(tempDir, "b.ts"), '<li *for="let x of xs">{{ x }}</li>');

    const result = migrateLegacyTemplatesInProject(tempDir, false);
    expect(result.totalReplacements).toBe(3);
    expect(result.filesChanged).toBe(2);
  });
});
