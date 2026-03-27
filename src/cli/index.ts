#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { generateComponent } from "./generators/component";
import { generateModule } from "./generators/module";
import { generateService } from "./generators/service";
import { scaffoldNewApp } from "./scaffolder";
import {
  generateEnvProduction,
  generateGitHubSecrets,
  generateK8sManifest,
  generateNginxConfig,
  generateMonitoringConfig,
} from "./templates";
import { MCPService } from "../app/core/mcp/service";
import { startMCPStdioServer } from "../app/core/mcp/stdio";
import { resolveMCPHttpOptionsFromEnv, startMCPHttpServer } from "../app/core/mcp/http";
import { startTemplatePlayground } from "./template-playground";
import { runAppSetupAssistant, runMCPSetupAssistant } from "./setup-assistant";
import { migrateLegacyTemplatesInProject } from "./template-migrator";

function printHelp(): void {
  console.log("Nexular CLI");
  console.log("Commands:");
  console.log("  nexular new app <name> [--template minimal|full|with-auth|showcase-i18n]");
  console.log("  nexular create <name> [--template minimal|full|with-auth|showcase-i18n]");
  console.log(
    "  nexular setup app [--name <name>] [--template minimal|full|with-auth|showcase-i18n]"
  );
  console.log("  nexular setup mcp [--transport stdio|http] [--start]");
  console.log("  nexular generate <env-prod|k8s|nginx|monitoring>");
  console.log("  nexular g module <name>");
  console.log("  nexular g component <name>");
  console.log("  nexular g service <name>");
  console.log("  nexular test");
  console.log("  nexular doctor");
  console.log("  nexular template playground [--port <number>] [--host <host>]");
  console.log("  nexular template migrate-legacy [--root <path>] [--write]");
  console.log("  nexular release [patch|minor|major]");
  console.log('  nexular ai "<prompt>"');
  console.log('  nexular mcp codegen "<prompt>" [--write]');
  console.log("  nexular mcp architect");
  console.log("  nexular mcp perf");
  console.log("  nexular mcp qa");
  console.log("  nexular mcp protocol");
  console.log("  nexular mcp stdio");
  console.log(
    "  nexular mcp http [--port <number>] [--host <host>] [--path <path>] [--auth-bearer <token>] [--cors-enabled true|false] [--cors-origins <csv>] [--rate-limit-enabled true|false] [--rate-limit-max-requests <number>] [--rate-limit-window-ms <number>] [--max-sse-clients <number>] [--max-request-bytes <number>] [--audit-enabled true|false]"
  );
}

function runDoctor(): void {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  const nodeMajor = Number(process.versions.node.split(".")[0] ?? "0");
  checks.push({
    name: "Node.js version",
    ok: nodeMajor >= 22,
    detail: `detected=${process.versions.node}; expected>=22`,
  });

  const npmVersion = spawnSync("npm", ["--version"], { encoding: "utf8" });
  checks.push({
    name: "npm availability",
    ok: npmVersion.status === 0,
    detail: npmVersion.status === 0 ? `version=${npmVersion.stdout.trim()}` : "npm not found",
  });

  const requiredPaths = [
    path.join(process.cwd(), "package.json"),
    path.join(process.cwd(), "tsconfig.json"),
    path.join(process.cwd(), "src", "app", "routes", "page.ts"),
  ];

  requiredPaths.forEach((item) => {
    checks.push({
      name: `path exists: ${path.relative(process.cwd(), item)}`,
      ok: fs.existsSync(item),
      detail: fs.existsSync(item) ? "ok" : "missing",
    });
  });

  const runtimeConfigPath = path.join(process.cwd(), "nexular.runtime.json");
  checks.push({
    name: "runtime config",
    ok: fs.existsSync(runtimeConfigPath),
    detail: fs.existsSync(runtimeConfigPath) ? "found" : "not found",
  });

  const hasShowcaseRoot = Boolean(process.env.NEXULAR_SHOWCASE_ROOT);
  checks.push({
    name: "showcase setup",
    ok: hasShowcaseRoot,
    detail: hasShowcaseRoot
      ? `NEXULAR_SHOWCASE_ROOT=${process.env.NEXULAR_SHOWCASE_ROOT}`
      : "Set NEXULAR_SHOWCASE_ROOT to validate showcase suite",
  });

  const failing = checks.filter((check) => !check.ok);

  console.log("Nexular Doctor");
  checks.forEach((check) => {
    const status = check.ok ? "OK" : "FAIL";
    console.log(`- [${status}] ${check.name}: ${check.detail}`);
  });

  if (failing.length === 0) {
    console.log("\nAll checks passed.");
    return;
  }

  console.log(`\n${failing.length} check(s) require attention.`);
  process.exitCode = 1;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((arg) => arg === flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function runGenerator(type: string | undefined, name: string | undefined): void {
  if (!type || !name) {
    throw new Error("Use: nexular g <module|component|service> <name>");
  }

  const out = path.join(process.cwd(), "src", "app", "shared");
  let filePath = "";

  if (type === "module") filePath = generateModule(name, out);
  if (type === "component") filePath = generateComponent(name, out);
  if (type === "service") filePath = generateService(name, out);

  if (!filePath) {
    throw new Error(`Generator not supported: ${type}`);
  }

  console.log(`Arquivo gerado: ${filePath}`);
}

function runRelease(bumpType: string | undefined): void {
  const packagePath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(packagePath)) {
    throw new Error("package.json not found in current directory");
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version: string };
  const currentVersion = packageJson.version;
  const parts = currentVersion.split(".").map(Number);

  const bump = bumpType || "patch";
  if (!["patch", "minor", "major"].includes(bump)) {
    throw new Error(`Invalid bump type: ${bump}. Use patch, minor, or major.`);
  }

  if (bump === "patch") parts[2]++;
  else if (bump === "minor") {
    parts[1]++;
    parts[2] = 0;
  } else if (bump === "major") {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  }

  const newVersion = parts.join(".");
  packageJson.version = newVersion;

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n");

  console.log(`\nBumping version: ${currentVersion} -> ${newVersion}`);

  // Commit and tag
  spawnSync("git", ["add", "package.json"], { stdio: "inherit" });
  spawnSync("git", ["commit", "-m", `release: v${newVersion}`], { stdio: "inherit" });
  spawnSync("git", ["tag", `v${newVersion}`], { stdio: "inherit" });
  spawnSync("git", ["push"], { stdio: "inherit" });
  spawnSync("git", ["push", "--tags"], { stdio: "inherit" });

  // Publish to npm
  spawnSync("npm", ["publish"], { stdio: "inherit" });

  console.log(`\n✓ Released v${newVersion}`);
  console.log(`\nNext steps:`);
  console.log(
    `  - Create GitHub Release: https://github.com/yourorg/nexular/releases/new?tag=v${newVersion}`
  );
  console.log(`  - Notify users about changes in v${newVersion}`);
}

function generateProductionTemplate(template: string | undefined): void {
  if (!template) {
    throw new Error("Use: nexular generate <env-prod|k8s|nginx|monitoring> [appName] [domain]");
  }

  const outDir = process.cwd();

  switch (template) {
    case "env-prod":
      const envPath = generateEnvProduction(outDir);
      console.log(`✓ Environment file generated: ${envPath}`);
      console.log("  Update with your production secrets before deploying");
      break;

    case "github-secrets":
      const secretsPath = generateGitHubSecrets(outDir);
      console.log(`✓ GitHub secrets template generated: ${secretsPath}`);
      console.log("  Add these secrets to your GitHub repository");
      break;

    case "k8s":
      const k8sPath = generateK8sManifest(outDir, "my-app");
      console.log(`✓ Kubernetes manifest generated: ${k8sPath}`);
      console.log("  Deploy with: kubectl apply -f k8s-deployment.yaml");
      break;

    case "nginx":
      const nginxPath = generateNginxConfig(outDir, "example.com");
      console.log(`✓ Nginx config template generated: ${nginxPath}`);
      console.log("  Configure domain and SSL before deploying");
      break;

    case "monitoring":
      const monitoringPath = generateMonitoringConfig(outDir);
      console.log(`✓ Monitoring config generated: ${monitoringPath}`);
      console.log("  Integrate with Prometheus and Grafana");
      break;

    default:
      throw new Error(`Unknown template: ${template}`);
  }
}

function printFindings(
  title: string,
  findings: Array<{ level: string; message: string; file?: string }>
): void {
  console.log(title);
  if (findings.length === 0) {
    console.log("  Sem findings.");
    return;
  }

  findings.forEach((finding) => {
    const at = finding.file ? ` (${finding.file})` : "";
    console.log(`  [${finding.level}] ${finding.message}${at}`);
  });
}

function runMCP(args: string[]): void {
  const mcp = new MCPService();
  const [mode, ...rest] = args;
  const projectRoot = process.cwd();

  if (mode === "codegen") {
    const write = rest.includes("--write");
    const prompt = rest
      .filter((item) => item !== "--write")
      .join(" ")
      .trim();

    if (!prompt) {
      throw new Error('Use: nexular mcp codegen "<prompt>" [--write]');
    }

    const result = mcp.generateCode(prompt, projectRoot);
    console.log(`Feature: ${result.featureName}`);
    console.log(`Actions: ${result.actionNames.join(", ")}`);
    console.log(`i18n: ${result.i18nKeys.join(", ")}`);

    if (write) {
      const written = mcp.writeGeneratedCode(result, projectRoot);
      console.log(`Arquivos gerados: ${written.join(", ")}`);
    } else {
      console.log("Arquivos planejados:");
      result.generatedFiles.forEach((file) => {
        console.log(`  - ${file.filePath}`);
      });
      console.log("Use --write para materializar os arquivos.");
    }
    return;
  }

  if (mode === "architect") {
    const report = mcp.analyzeArchitecture(projectRoot);
    console.log(`Architecture score: ${report.score}/100`);
    printFindings("Findings:", report.findings);
    if (report.recommendations.length > 0) {
      console.log("Recomendacoes:");
      report.recommendations.forEach((item) => console.log(`  - ${item}`));
    }
    return;
  }

  if (mode === "perf") {
    const report = mcp.analyzePerformance(projectRoot);
    printFindings("Findings:", report.findings);
    console.log("Hints por rota:");
    report.hints.forEach((hint) => {
      console.log(
        `  - ${hint.route}: revalidate=${hint.revalidate}, hydrate=${hint.hydration} (${hint.rationale})`
      );
    });
    return;
  }

  if (mode === "qa") {
    const report = mcp.analyzeQA(projectRoot);
    printFindings("Findings:", report.findings);
    if (report.suggestedTests.length > 0) {
      console.log("Testes sugeridos:");
      report.suggestedTests.forEach((task) => {
        console.log(`  - ${task.title}: ${task.file} (${task.reason})`);
      });
    }
    return;
  }

  if (mode === "protocol") {
    const initialized = mcp.initialize({
      protocolVersion: "2025-06-18",
      capabilities: {
        elicitation: {},
        logging: {},
      },
      clientInfo: {
        name: "nexular-cli",
        version: "0.1.0",
      },
    });
    mcp.notifyInitialized();

    const lifecycle = mcp.getLifecycleState();
    const tools = mcp.listTools();
    const resources = mcp.listResources();
    const prompts = mcp.listPrompts();

    console.log("MCP Protocol Status:");
    console.log(JSON.stringify({ initialized, lifecycle, tools, resources, prompts }, null, 2));
    return;
  }

  if (mode === "stdio") {
    startMCPStdioServer({
      projectRoot: process.env.NEXULAR_MCP_PROJECT_ROOT ?? projectRoot,
    });
    return;
  }

  if (mode === "http") {
    const portFlag = getFlagValue(rest, "--port") ?? process.env.NEXULAR_MCP_HTTP_PORT;
    const hostFlag = getFlagValue(rest, "--host") ?? process.env.NEXULAR_MCP_HTTP_HOST;
    const pathFlag = getFlagValue(rest, "--path") ?? process.env.NEXULAR_MCP_HTTP_PATH;

    const port = portFlag ? Number(portFlag) : 3334;
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      throw new Error("Invalid MCP HTTP port. Use a number between 1 and 65535.");
    }

    const host = hostFlag ?? "127.0.0.1";
    const endpointPath = pathFlag ?? "/mcp";
    const authBearerFlag = getFlagValue(rest, "--auth-bearer");
    const corsOriginsFlag = getFlagValue(rest, "--cors-origins");
    const corsEnabledFlag = getFlagValue(rest, "--cors-enabled");
    const corsHeadersFlag = getFlagValue(rest, "--cors-headers");
    const corsMethodsFlag = getFlagValue(rest, "--cors-methods");
    const corsCredentialsFlag = getFlagValue(rest, "--cors-credentials");
    const rateLimitEnabledFlag = getFlagValue(rest, "--rate-limit-enabled");
    const rateLimitMaxRequestsFlag = getFlagValue(rest, "--rate-limit-max-requests");
    const rateLimitWindowMsFlag = getFlagValue(rest, "--rate-limit-window-ms");
    const maxSseClientsFlag = getFlagValue(rest, "--max-sse-clients");
    const maxRequestBytesFlag = getFlagValue(rest, "--max-request-bytes");
    const auditEnabledFlag = getFlagValue(rest, "--audit-enabled");

    const envOptions = resolveMCPHttpOptionsFromEnv();
    const parseCsv = (value: string | undefined): string[] | undefined => {
      if (!value) {
        return undefined;
      }

      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    };

    const boolFromString = (value: string | undefined): boolean | undefined => {
      if (value === undefined) {
        return undefined;
      }

      const normalized = value.toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      throw new Error(`Invalid boolean flag value: ${value}. Use true or false.`);
    };

    const numberFromString = (value: string | undefined): number | undefined => {
      if (value === undefined) {
        return undefined;
      }

      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid numeric flag value: ${value}.`);
      }

      return parsed;
    };

    void startMCPHttpServer({
      host,
      port,
      path: endpointPath,
      auth: {
        bearerToken: authBearerFlag ?? envOptions.auth?.bearerToken,
      },
      cors: {
        enabled: boolFromString(corsEnabledFlag) ?? envOptions.cors?.enabled,
        allowOrigins: parseCsv(corsOriginsFlag) ?? envOptions.cors?.allowOrigins,
        allowHeaders: parseCsv(corsHeadersFlag) ?? envOptions.cors?.allowHeaders,
        allowMethods: parseCsv(corsMethodsFlag) ?? envOptions.cors?.allowMethods,
        allowCredentials: boolFromString(corsCredentialsFlag) ?? envOptions.cors?.allowCredentials,
      },
      security: {
        rateLimit: {
          enabled: boolFromString(rateLimitEnabledFlag) ?? envOptions.security?.rateLimit?.enabled,
          maxRequestsPerWindow:
            numberFromString(rateLimitMaxRequestsFlag) ??
            envOptions.security?.rateLimit?.maxRequestsPerWindow,
          windowMs:
            numberFromString(rateLimitWindowMsFlag) ?? envOptions.security?.rateLimit?.windowMs,
        },
        quotas: {
          maxSSEClients:
            numberFromString(maxSseClientsFlag) ?? envOptions.security?.quotas?.maxSSEClients,
          maxRequestBodyBytes:
            numberFromString(maxRequestBytesFlag) ??
            envOptions.security?.quotas?.maxRequestBodyBytes,
        },
        audit: {
          enabled: boolFromString(auditEnabledFlag) ?? envOptions.security?.audit?.enabled,
          includeHeaders: envOptions.security?.audit?.includeHeaders,
        },
      },
      projectRoot: process.env.NEXULAR_MCP_PROJECT_ROOT ?? projectRoot,
      logger: (message) => {
        console.log(message);
      },
    });
    return;
  }

  throw new Error("Use: nexular mcp <codegen|architect|perf|qa|protocol|stdio|http>");
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, arg1, arg2, ...rest] = args;

  if (!command) {
    printHelp();
    return;
  }

  if (command === "new" && arg1 === "app") {
    if (!arg2) {
      throw new Error("Use: nexular new app <project-name>");
    }

    const template = getFlagValue(args, "--template") as
      | "minimal"
      | "full"
      | "with-auth"
      | "showcase-i18n"
      | undefined;
    if (template && !["minimal", "full", "with-auth", "showcase-i18n"].includes(template)) {
      throw new Error("Invalid template. Use: minimal, full, with-auth or showcase-i18n");
    }

    const projectPath = scaffoldNewApp(arg2, { template: template ?? "full" });
    console.log(`✓ Project created at ${projectPath}`);
    console.log(`✓ Template: ${template ?? "full"}`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${arg2}`);
    console.log(`  npm install`);
    console.log(`  npm run dev`);
    console.log(`\nEnvironment files:`);
    console.log(`  - .env.example (template)`);
    console.log(`  - .env.local (git-ignored, for local config)`);
    console.log(`\nDockerization:`);
    console.log(`  docker-compose up --build`);
    return;
  }

  if (command === "create") {
    const projectName = arg1;
    if (!projectName) {
      throw new Error("Use: nexular create <project-name>");
    }

    const template = getFlagValue(args, "--template") as
      | "minimal"
      | "full"
      | "with-auth"
      | "showcase-i18n"
      | undefined;
    if (template && !["minimal", "full", "with-auth", "showcase-i18n"].includes(template)) {
      throw new Error("Invalid template. Use: minimal, full, with-auth or showcase-i18n");
    }

    const projectPath = scaffoldNewApp(projectName, {
      frameworkDependency: `file:${path.resolve(__dirname, "../..")}`,
      template: template ?? "full",
    });
    console.log(`✓ Project created at ${projectPath}`);
    console.log(`✓ Template: ${template ?? "full"}`);
    console.log("\nNext steps:");
    console.log(`  cd ${projectName}`);
    console.log("  npm install");
    console.log("  npm run dev");
    return;
  }

  if (command === "generate") {
    generateProductionTemplate(arg1);
    return;
  }

  if (command === "g") {
    runGenerator(arg1, arg2);
    return;
  }

  if (command === "test") {
    spawnSync("npm", ["run", "test"], { stdio: "inherit" });
    return;
  }

  if (command === "doctor") {
    runDoctor();
    return;
  }

  if (command === "template" && arg1 === "playground") {
    const portFlag = getFlagValue(args, "--port");
    const hostFlag = getFlagValue(args, "--host");

    const port = portFlag ? Number(portFlag) : 3340;
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      throw new Error("Invalid playground port. Use a number between 1 and 65535.");
    }

    const host = hostFlag ?? "127.0.0.1";

    void startTemplatePlayground({
      host,
      port,
      logger: (message) => {
        console.log(message);
      },
    });
    return;
  }

  if (command === "template" && arg1 === "migrate-legacy") {
    const root = getFlagValue(args, "--root") ?? process.cwd();
    const write = args.includes("--write");
    const migration = migrateLegacyTemplatesInProject(path.resolve(process.cwd(), root), write);

    console.log(`Modo: ${write ? "apply" : "dry-run"}`);
    console.log(`Arquivos analisados: ${migration.filesChecked}`);
    console.log(`Arquivos alterados: ${migration.filesChanged}`);
    console.log(`Substituicoes: ${migration.totalReplacements}`);

    migration.changes.forEach((change) => {
      console.log(`  - ${change.filePath} (${change.replacements})`);
    });
    return;
  }

  if (command === "setup" && arg1 === "app") {
    await runAppSetupAssistant(args);
    return;
  }

  if (command === "setup" && arg1 === "mcp") {
    await runMCPSetupAssistant(args);
    return;
  }

  if (command === "release") {
    runRelease(arg1);
    return;
  }

  if (command === "ai") {
    const prompt = args.slice(1).join(" ").trim();
    if (!prompt) {
      throw new Error('Use: nexular ai "<prompt>"');
    }

    const mcp = new MCPService();
    const result = mcp.run(prompt);
    console.log(result.summary);
    console.log(`Arquivos sugeridos: ${result.generatedFiles.join(", ")}`);
    console.log(`Chaves i18n sugeridas: ${result.i18nKeys.join(", ")}`);
    return;
  }

  if (command === "mcp") {
    runMCP([arg1, arg2, ...rest].filter(Boolean) as string[]);
    return;
  }

  printHelp();
}

void run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(message);
  process.exitCode = 1;
});
