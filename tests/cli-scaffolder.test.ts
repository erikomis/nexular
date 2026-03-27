import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldNewApp } from "../src/cli/scaffolder";

describe("CLI Scaffolder - new app", () => {
  let tempDir: string;

  const setup = (): void => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-scaffold-"));
    process.chdir(tempDir);
  };

  afterEach(() => {
    process.chdir("/");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("should create project structure with all required files", () => {
    setup();
    const projectPath = scaffoldNewApp("my-app");

    expect(fs.existsSync(path.join(projectPath, ".env.example"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, ".env.local"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "docker-compose.yml"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "nexular.runtime.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "plugins", "auth"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "tsconfig.json"))).toBe(true);
  });

  it("should generate a valid tsconfig.json for TypeScript compilation", () => {
    setup();
    const projectPath = scaffoldNewApp("my-app");
    const tsconfig = JSON.parse(fs.readFileSync(path.join(projectPath, "tsconfig.json"), "utf8"));

    expect(tsconfig.compilerOptions.target).toBe("ES2020");
    expect(tsconfig.compilerOptions.module).toBe("CommonJS");
    expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.outDir).toBe("./dist");
    expect(tsconfig.include).toContain("src/**/*");
  });

  it("should throw if project directory already exists", () => {
    setup();
    fs.mkdirSync("existing-app");
    expect(() => scaffoldNewApp("existing-app")).toThrow("Project directory already exists");
  });

  it("should have valid nexular.runtime.json", () => {
    setup();
    const projectPath = scaffoldNewApp("my-app");
    const configPath = path.join(projectPath, "nexular.runtime.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    expect(config.default).toBeDefined();
    expect(config.default.auth).toBeDefined();
    expect(config.default.security).toBeDefined();
    expect(config.environments.production).toBeDefined();
  });

  it("should include docker configuration", () => {
    setup();
    const projectPath = scaffoldNewApp("my-app");
    const dockerCompose = fs.readFileSync(path.join(projectPath, "docker-compose.yml"), "utf8");

    expect(dockerCompose).toContain("services:");
    expect(dockerCompose).toContain("ports:");
    expect(dockerCompose).toContain("3000:3000");

    const dockerfile = fs.readFileSync(path.join(projectPath, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("FROM node:20-alpine");
    expect(dockerfile).toContain("WORKDIR /app");
  });

  it("should have environment template with all key variables", () => {
    setup();
    const projectPath = scaffoldNewApp("my-app");
    const envExample = fs.readFileSync(path.join(projectPath, ".env.example"), "utf8");

    expect(envExample).toContain("NEXULAR_ENV");
    expect(envExample).toContain("NODE_ENV");
    expect(envExample).toContain("NEXULAR_AUTH_PLUGINS");
    expect(envExample).toContain("NEXULAR_OBSERVABILITY_TOKEN");
    expect(envExample).toContain("NEXULAR_SECURITY_CORS_ALLOW_LIST");
  });

  it("should generate official showcase starter with i18n files", () => {
    setup();
    const projectPath = scaffoldNewApp("showcase-app", { template: "showcase-i18n" });

    // Check Angular-aligned structure
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
    expect(
      fs.existsSync(path.join(projectPath, "src", "app", "core", "services", "i18n.service.ts"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectPath, "src", "app", "shared", "pipes", "i18n.pipe.ts"))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectPath, "src", "app", "shared", "components", "locale.switcher.component.ts")
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(projectPath, "src", "app", "shared", "directives", "highlight.directive.ts")
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "src", "app", "routes", "page.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "src", "app", "routes.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "src", "app", "layout.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "src", "app", "app.ts"))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, "src", "assets", "styles", "global.css"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(projectPath, "src", "environments", "environment.ts"))).toBe(
      true
    );

    // Check that i18n service contains the translated strings
    const i18nServiceFile = fs.readFileSync(
      path.join(projectPath, "src", "app", "core", "services", "i18n.service.ts"),
      "utf8"
    );
    expect(i18nServiceFile).toContain("Nexular Official Starter");
    expect(i18nServiceFile).toContain("Starter Oficial Nexular");
  });
});
