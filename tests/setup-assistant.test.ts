import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runAppSetupAssistant, runMCPSetupAssistant } from "../src/cli/setup-assistant";

let tempDir = "";

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("runAppSetupAssistant", () => {
  it("scaffolds a project when --name and --template are provided", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-setup-app-"));
    process.chdir(tempDir);

    await runAppSetupAssistant(["--name", "test-project", "--template", "minimal"]);

    const projectPath = path.join(tempDir, "test-project");
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "tsconfig.json"))).toBe(true);
  });

  it("defaults to showcase-i18n template when --template is omitted", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-setup-default-"));
    process.chdir(tempDir);

    // stdin is not a TTY in the test runner, so promptValue returns the fallback
    await runAppSetupAssistant(["--name", "showcase-default"]);

    const projectPath = path.join(tempDir, "showcase-default");
    expect(fs.existsSync(projectPath)).toBe(true);
    // showcase-i18n creates Angular-aligned structure with i18n service
    expect(
      fs.existsSync(path.join(projectPath, "src", "app", "core", "services", "i18n.service.ts"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          projectPath,
          "src",
          "app",
          "features",
          "home",
          "components",
          "showcase.component.ts"
        )
      )
    ).toBe(true);
  });

  it("falls back to showcase-i18n for an unrecognised template value", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-setup-fallback-"));
    process.chdir(tempDir);

    await runAppSetupAssistant(["--name", "fallback-app", "--template", "unknown-template"]);

    const projectPath = path.join(tempDir, "fallback-app");
    expect(fs.existsSync(projectPath)).toBe(true);
    // showcase-i18n creates Angular-aligned structure
    expect(
      fs.existsSync(
        path.join(
          projectPath,
          "src",
          "app",
          "features",
          "home",
          "components",
          "showcase.component.ts"
        )
      )
    ).toBe(true);
  });

  it("creates a full-template project with docker files", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-setup-full-"));
    process.chdir(tempDir);

    await runAppSetupAssistant(["--name", "full-app", "--template", "full"]);

    const projectPath = path.join(tempDir, "full-app");
    expect(fs.existsSync(path.join(projectPath, "docker-compose.yml"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "Dockerfile"))).toBe(true);
  });
});

describe("runMCPSetupAssistant", () => {
  it("resolves stdio transport configuration without starting", async () => {
    // Should complete without throwing and without binding a port
    await expect(runMCPSetupAssistant(["--transport", "stdio"])).resolves.not.toThrow();
  });

  it("resolves http transport configuration without starting", async () => {
    await expect(
      runMCPSetupAssistant(["--transport", "http", "--host", "127.0.0.1", "--port", "3339"])
    ).resolves.not.toThrow();
  });

  it("throws for an invalid port number", async () => {
    await expect(runMCPSetupAssistant(["--transport", "http", "--port", "99999"])).rejects.toThrow(
      /porta inválida/i
    );
  });

  it("throws for a non-numeric port string", async () => {
    await expect(
      runMCPSetupAssistant(["--transport", "http", "--port", "not-a-port"])
    ).rejects.toThrow(/porta inválida/i);
  });
});
