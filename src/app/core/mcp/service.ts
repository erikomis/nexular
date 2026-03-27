import fs from "node:fs";
import path from "node:path";

export type MCPResult = {
  summary: string;
  generatedFiles: string[];
  i18nKeys: string[];
};

export type MCPFinding = {
  level: "info" | "warning" | "error";
  message: string;
  file?: string;
};

export type MCPArchitectureReport = {
  score: number;
  findings: MCPFinding[];
  recommendations: string[];
};

export type MCPPerfRouteHint = {
  route: string;
  revalidate: number;
  hydration: "none" | "island" | "client";
  rationale: string;
};

export type MCPPerformanceReport = {
  hints: MCPPerfRouteHint[];
  findings: MCPFinding[];
};

export type MCPQATask = {
  title: string;
  file: string;
  reason: string;
};

export type MCPQAReport = {
  findings: MCPFinding[];
  suggestedTests: MCPQATask[];
};

export type MCPGeneratedFile = {
  filePath: string;
  content: string;
};

export type MCPCodegenResult = {
  featureName: string;
  generatedFiles: MCPGeneratedFile[];
  i18nKeys: string[];
  actionNames: string[];
};

export type MCPProtocolVersion = "2025-06-18";

export type MCPClientCapabilities = {
  elicitation?: Record<string, never>;
  sampling?: Record<string, never>;
  logging?: Record<string, never>;
};

export type MCPServerCapabilities = {
  tools?: { listChanged?: boolean };
  resources?: Record<string, never>;
  prompts?: Record<string, never>;
  logging?: Record<string, never>;
};

export type MCPInitializeParams = {
  protocolVersion: string;
  capabilities?: MCPClientCapabilities;
  clientInfo?: { name: string; version: string };
};

export type MCPInitializeResult = {
  protocolVersion: MCPProtocolVersion;
  capabilities: MCPServerCapabilities;
  serverInfo: { name: string; version: string };
};

export type MCPTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type MCPToolCallContent = {
  type: "text";
  text: string;
};

export type MCPToolCallResult = {
  content: MCPToolCallContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

export type MCPResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
};

export type MCPResourceReadResult = {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
};

export type MCPPrompt = {
  name: string;
  title: string;
  description: string;
  arguments?: Array<{
    name: string;
    required?: boolean;
    description?: string;
  }>;
};

export type MCPPromptGetResult = {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: {
      type: "text";
      text: string;
    };
  }>;
};

export type MCPJsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type MCPJsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type MCPNotification = {
  method:
    | "notifications/tools/list_changed"
    | "notifications/resources/list_changed"
    | "notifications/prompts/list_changed";
};

type MCPToolHandler = (
  args: Record<string, unknown>,
  context: { projectRoot: string }
) => Promise<MCPToolCallResult>;

type MCPRegisteredTool = {
  tool: MCPTool;
  handler: MCPToolHandler;
};

type MCPResourceHandler = (context: { projectRoot: string }) => Promise<MCPResourceReadResult>;

type MCPRegisteredResource = {
  resource: MCPResource;
  handler: MCPResourceHandler;
};

type MCPPromptHandler = (
  args: Record<string, unknown>,
  context: { projectRoot: string }
) => Promise<MCPPromptGetResult>;

type MCPRegisteredPrompt = {
  prompt: MCPPrompt;
  handler: MCPPromptHandler;
};

function toKebabCase(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "feature"
  );
}

function toPascalCase(input: string): string {
  return toKebabCase(input)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function walkFiles(dirPath: string, matcher: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, matcher));
      return;
    }

    if (matcher(fullPath)) {
      results.push(fullPath);
    }
  });

  return results;
}

function upsertReportScore(base: number, findings: MCPFinding[]): number {
  const delta = findings.reduce((acc, finding) => {
    if (finding.level === "error") return acc - 15;
    if (finding.level === "warning") return acc - 7;
    return acc - 2;
  }, 0);

  return Math.max(0, Math.min(100, base + delta));
}

export class MCPService {
  private readonly protocolVersion: MCPProtocolVersion = "2025-06-18";
  private readonly serverInfo = {
    name: "nexular-mcp",
    version: "0.1.0",
  };
  private readonly capabilities: MCPServerCapabilities = {
    tools: { listChanged: true },
    resources: {},
    prompts: {},
    logging: {},
  };
  private initialized = false;
  private initializedByClient = false;
  private clientInfo?: { name: string; version: string };
  private clientCapabilities: MCPClientCapabilities = {};
  private readonly tools = new Map<string, MCPRegisteredTool>();
  private readonly resources = new Map<string, MCPRegisteredResource>();
  private readonly prompts = new Map<string, MCPRegisteredPrompt>();
  private readonly notificationSubscribers = new Set<(notification: MCPNotification) => void>();

  constructor() {
    this.registerBuiltinTools();
    this.registerBuiltinResources();
    this.registerBuiltinPrompts();
  }

  run(prompt: string): MCPResult {
    const blueprint = this.generateCode(prompt, process.cwd());

    return {
      summary: `MCP processou o prompt: ${prompt}`,
      generatedFiles: blueprint.generatedFiles.map((item) => item.filePath),
      i18nKeys: blueprint.i18nKeys,
    };
  }

  initialize(params: MCPInitializeParams): MCPInitializeResult {
    if (!params.protocolVersion) {
      throw new Error("protocolVersion is required");
    }

    if (params.protocolVersion !== this.protocolVersion) {
      throw new Error(
        `Unsupported protocolVersion ${params.protocolVersion}. Expected ${this.protocolVersion}`
      );
    }

    this.initialized = true;
    this.clientInfo = params.clientInfo;
    this.clientCapabilities = params.capabilities ?? {};

    return {
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
    };
  }

  notifyInitialized(): void {
    if (!this.initialized) {
      throw new Error("MCP lifecycle not initialized. Call initialize first.");
    }

    this.initializedByClient = true;
  }

  getLifecycleState(): {
    initialized: boolean;
    initializedByClient: boolean;
    clientInfo?: { name: string; version: string };
    protocolVersion: MCPProtocolVersion;
  } {
    return {
      initialized: this.initialized,
      initializedByClient: this.initializedByClient,
      clientInfo: this.clientInfo,
      protocolVersion: this.protocolVersion,
    };
  }

  listTools(): MCPTool[] {
    this.ensureInitialized();
    return Array.from(this.tools.values()).map((entry) => entry.tool);
  }

  listResources(): MCPResource[] {
    this.ensureInitialized();
    return Array.from(this.resources.values()).map((entry) => entry.resource);
  }

  async readResource(
    uri: string,
    context: { projectRoot?: string } = {}
  ): Promise<MCPResourceReadResult> {
    this.ensureInitialized();

    const entry = this.resources.get(uri);
    if (!entry) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: `Resource not found: ${uri}`,
          },
        ],
      };
    }

    return await entry.handler({
      projectRoot: context.projectRoot ?? process.cwd(),
    });
  }

  listPrompts(): MCPPrompt[] {
    this.ensureInitialized();
    return Array.from(this.prompts.values()).map((entry) => entry.prompt);
  }

  async getPrompt(
    name: string,
    args: Record<string, unknown> = {},
    context: { projectRoot?: string } = {}
  ): Promise<MCPPromptGetResult> {
    this.ensureInitialized();

    const entry = this.prompts.get(name);
    if (!entry) {
      return {
        messages: [
          {
            role: "system",
            content: {
              type: "text",
              text: `Prompt not found: ${name}`,
            },
          },
        ],
      };
    }

    return await entry.handler(args, {
      projectRoot: context.projectRoot ?? process.cwd(),
    });
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    context: { projectRoot?: string } = {}
  ): Promise<MCPToolCallResult> {
    this.ensureInitialized();

    const entry = this.tools.get(name);
    if (!entry) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool not found: ${name}` }],
      };
    }

    try {
      return await entry.handler(args, {
        projectRoot: context.projectRoot ?? process.cwd(),
      });
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Unknown MCP tool execution error",
          },
        ],
      };
    }
  }

  onNotification(handler: (notification: MCPNotification) => void): () => void {
    this.notificationSubscribers.add(handler);
    return () => this.notificationSubscribers.delete(handler);
  }

  registerTool(tool: MCPTool, handler: MCPToolHandler): void {
    this.tools.set(tool.name, { tool, handler });
    this.emitToolsListChanged();
  }

  unregisterTool(name: string): void {
    if (this.tools.delete(name)) {
      this.emitToolsListChanged();
    }
  }

  registerResource(resource: MCPResource, handler: MCPResourceHandler): void {
    this.resources.set(resource.uri, { resource, handler });
    this.emitResourcesListChanged();
  }

  unregisterResource(uri: string): void {
    if (this.resources.delete(uri)) {
      this.emitResourcesListChanged();
    }
  }

  registerPrompt(prompt: MCPPrompt, handler: MCPPromptHandler): void {
    this.prompts.set(prompt.name, { prompt, handler });
    this.emitPromptsListChanged();
  }

  unregisterPrompt(name: string): void {
    if (this.prompts.delete(name)) {
      this.emitPromptsListChanged();
    }
  }

  async handleJsonRpcRequest(
    request: MCPJsonRpcRequest,
    context: { projectRoot?: string } = {}
  ): Promise<MCPJsonRpcResponse | null> {
    const requestId = request.id ?? null;

    const success = (result: unknown): MCPJsonRpcResponse | null => {
      if (request.id === undefined) {
        return null;
      }

      return {
        jsonrpc: "2.0",
        id: requestId,
        result,
      };
    };

    const failure = (code: number, message: string, data?: unknown): MCPJsonRpcResponse => {
      return {
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code,
          message,
          data,
        },
      };
    };

    try {
      switch (request.method) {
        case "initialize":
          return success(this.initialize((request.params ?? {}) as MCPInitializeParams));

        case "notifications/initialized":
          this.notifyInitialized();
          return null;

        case "tools/list":
          return success({ tools: this.listTools() });

        case "tools/call": {
          const name = String(request.params?.name ?? "");
          const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
          if (!name) {
            return failure(-32602, "Tool name is required");
          }
          const result = await this.callTool(name, args, context);
          return success(result);
        }

        case "resources/list":
          return success({ resources: this.listResources() });

        case "resources/read": {
          const uri = String(request.params?.uri ?? "");
          if (!uri) {
            return failure(-32602, "Resource uri is required");
          }
          const result = await this.readResource(uri, context);
          return success(result);
        }

        case "prompts/list":
          return success({ prompts: this.listPrompts() });

        case "prompts/get": {
          const name = String(request.params?.name ?? "");
          const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
          if (!name) {
            return failure(-32602, "Prompt name is required");
          }
          const result = await this.getPrompt(name, args, context);
          return success(result);
        }

        default:
          return failure(-32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      return failure(-32000, error instanceof Error ? error.message : "Unknown MCP server error");
    }
  }

  generateCode(prompt: string, projectRoot: string): MCPCodegenResult {
    const nameMatch = prompt.match(
      /(?:criar|create|gerar|generate)\s+(?:tela|feature|modulo|m[oó]dulo)?\s*([a-zA-Z0-9-_]+)/i
    );
    const inferredName =
      nameMatch?.[1] ?? prompt.split(" ").filter(Boolean).slice(-1)[0] ?? "feature";
    const featureName = toKebabCase(inferredName);
    const classBase = toPascalCase(featureName);

    const componentFile = path.join(
      "src",
      "app",
      "modules",
      featureName,
      `${featureName}.component.ts`
    );
    const componentTemplateFile = path.join(
      "src",
      "app",
      "modules",
      featureName,
      `${featureName}.component.html`
    );
    const componentStyleFile = path.join(
      "src",
      "app",
      "modules",
      featureName,
      `${featureName}.component.scss`
    );
    const routeFile = path.join("src", "app", "routes", featureName, "page.ts");
    const testFile = path.join("tests", `${featureName}.route.test.ts`);

    const i18nKeys = [
      `${featureName}.title`,
      `${featureName}.subtitle`,
      `${featureName}.action.submit`,
    ];

    const generatedFiles: MCPGeneratedFile[] = [
      {
        filePath: componentFile,
        content:
          `import { Component, signal } from "../../core";\n\n` +
          `@Component({\n` +
          `  selector: "app-${featureName}",\n` +
          `  hydrate: "island",\n` +
          `  imports: [],\n` +
          `  templateUrl: "./${featureName}.component.html",\n` +
          `  styleUrls: ["./${featureName}.component.scss"],\n` +
          `})\n` +
          `export class ${classBase}Component {\n` +
          `  data = { subtitle: "" };\n` +
          `  submitted = signal(false);\n\n` +
          `  submit(): void {\n` +
          `    this.submitted.set(true);\n` +
          `  }\n` +
          `}\n`,
      },
      {
        filePath: componentTemplateFile,
        content:
          `<h1>{{ t('${featureName}.title') }}</h1>\n` +
          `<p>{{ data.subtitle }}</p>\n` +
          `<button (click)=\"submit()\">{{ t('${featureName}.action.submit') }}</button>\n`,
      },
      {
        filePath: componentStyleFile,
        content: `:host {\n  display: block;\n}\n`,
      },
      {
        filePath: routeFile,
        content:
          `import { ${classBase}Component } from "../../modules/${featureName}/${featureName}.component";\n` +
          `import { defineAction, type RouteContext } from "../../core/server-actions";\n\n` +
          `export const component = ${classBase}Component;\n` +
          `export const revalidate = 45;\n` +
          `export const cache = { ttl: 30 };\n\n` +
          `export async function loadData(ctx: RouteContext) {\n` +
          `  return {\n` +
          `    subtitle: ctx.locale === "en" ? "${classBase} ready" : "${classBase} pronto",\n` +
          `  };\n` +
          `}\n\n` +
          `export const actions = {\n` +
          `  submit: defineAction<{ value: string }, { ok: boolean }>(async (input) => ({ ok: Boolean(input.value) })),\n` +
          `};\n`,
      },
      {
        filePath: testFile,
        content:
          `import { describe, expect, it } from "vitest";\n` +
          `import { renderToString } from "../src/server/renderer";\n\n` +
          `describe("${featureName} route", () => {\n` +
          `  it("should render via SSR", async () => {\n` +
          `    const html = await renderToString("/${featureName}");\n` +
          `    expect(html).toContain("${featureName}.title");\n` +
          `  });\n` +
          `});\n`,
      },
    ];

    return {
      featureName,
      generatedFiles,
      i18nKeys,
      actionNames: ["submit"],
    };
  }

  writeGeneratedCode(result: MCPCodegenResult, projectRoot: string): string[] {
    const written: string[] = [];

    result.generatedFiles.forEach((file) => {
      const absolute = path.join(projectRoot, file.filePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, file.content, "utf8");
      written.push(file.filePath);
    });

    return written;
  }

  analyzeArchitecture(projectRoot: string): MCPArchitectureReport {
    const findings: MCPFinding[] = [];
    const recommendations: string[] = [];

    const routeFiles = walkFiles(path.join(projectRoot, "src", "app", "routes"), (file) =>
      file.endsWith("page.ts")
    );
    const componentFiles = walkFiles(path.join(projectRoot, "src", "app", "modules"), (file) =>
      file.endsWith(".component.ts")
    );

    if (routeFiles.length === 0) {
      findings.push({
        level: "error",
        message: "Nenhuma rota file-based encontrada em src/app/routes/**/page.ts",
      });
      recommendations.push("Crie rotas file-based para manter o padrão SSR-first.");
    }

    routeFiles.forEach((file) => {
      const content = readText(file);
      if (!content.includes("export const revalidate")) {
        findings.push({
          level: "warning",
          message: "Rota sem revalidate declarado.",
          file: path.relative(projectRoot, file),
        });
      }
      if (!content.includes("loadData")) {
        findings.push({
          level: "info",
          message: "Rota sem loadData; avalie mover fetch para servidor.",
          file: path.relative(projectRoot, file),
        });
      }
      if (!content.includes("actions") && content.includes("button")) {
        findings.push({
          level: "info",
          message: "Rota parece interativa sem Server Action tipada.",
          file: path.relative(projectRoot, file),
        });
      }
    });

    componentFiles.forEach((file) => {
      const content = readText(file);
      if (!content.includes("hydrate:")) {
        findings.push({
          level: "warning",
          message: "Componente sem modo de hidratação explícito.",
          file: path.relative(projectRoot, file),
        });
      }
      if (content.includes("fetch(")) {
        findings.push({
          level: "warning",
          message: "Fetch detectado em componente; prefira loadData de rota/layout.",
          file: path.relative(projectRoot, file),
        });
      }
    });

    if (findings.length > 0) {
      recommendations.push(
        "Padronize hydrate em todos os componentes de rota: none/island/client."
      );
      recommendations.push(
        "Garanta que cada page.ts tenha revalidate e cache declarativo quando aplicável."
      );
    }

    return {
      score: upsertReportScore(100, findings),
      findings,
      recommendations,
    };
  }

  analyzePerformance(projectRoot: string): MCPPerformanceReport {
    const hints: MCPPerfRouteHint[] = [];
    const findings: MCPFinding[] = [];

    const routeFiles = walkFiles(path.join(projectRoot, "src", "app", "routes"), (file) =>
      file.endsWith("page.ts")
    );

    routeFiles.forEach((file) => {
      const relative = path
        .relative(path.join(projectRoot, "src", "app", "routes"), path.dirname(file))
        .replace(/\\/g, "/");
      const route = relative === "" || relative === "." ? "/" : `/${relative}`;
      const content = readText(file);

      const revalidateMatch = content.match(/export const revalidate\s*=\s*(\d+)/);
      const revalidate = revalidateMatch ? Number(revalidateMatch[1]) : 0;

      let hydration: "none" | "island" | "client" = "island";
      if (content.includes("hydrate: 'none'") || content.includes('hydrate: "none"'))
        hydration = "none";
      if (content.includes("hydrate: 'client'") || content.includes('hydrate: "client"'))
        hydration = "client";

      const rationale =
        revalidate === 0
          ? "Sem cache de documento; pode aumentar carga no SSR."
          : `Documento cacheado por ${revalidate}s.`;

      hints.push({ route, revalidate, hydration, rationale });

      if (revalidate === 0) {
        findings.push({
          level: "warning",
          message: "Rota sem revalidate pode impactar TTFB em escala.",
          file: path.relative(projectRoot, file),
        });
      }

      if (hydration === "client") {
        findings.push({
          level: "warning",
          message: "Hidratação client total detectada; prefira islands.",
          file: path.relative(projectRoot, file),
        });
      }
    });

    return { hints, findings };
  }

  analyzeQA(projectRoot: string): MCPQAReport {
    const findings: MCPFinding[] = [];
    const suggestedTests: MCPQATask[] = [];

    const routeFiles = walkFiles(path.join(projectRoot, "src", "app", "routes"), (file) =>
      file.endsWith("page.ts")
    );
    const testsDir = path.join(projectRoot, "tests");
    const testFiles = walkFiles(testsDir, (file) => file.endsWith(".test.ts"));

    routeFiles.forEach((file) => {
      const relativeDir = path
        .relative(path.join(projectRoot, "src", "app", "routes"), path.dirname(file))
        .replace(/\\/g, "/");
      const routeName = relativeDir === "" || relativeDir === "." ? "root" : relativeDir;
      const expected = `${routeName}.route.test.ts`;

      const exists = testFiles.some((testFile) => path.basename(testFile) === expected);
      if (!exists) {
        findings.push({
          level: "warning",
          message: `Sem teste dedicado para a rota ${routeName}.`,
          file: path.relative(projectRoot, file),
        });
        suggestedTests.push({
          title: `Criar teste SSR da rota ${routeName}`,
          file: path.join("tests", expected),
          reason: "Garantir renderização SSR e payload de hydration da rota.",
        });
      }
    });

    if (testFiles.length < 5) {
      findings.push({
        level: "info",
        message: "Cobertura de testes ainda pequena para escala de framework.",
      });
    }

    return {
      findings,
      suggestedTests,
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize({
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "nexular-cli",
          version: "0.1.0",
        },
      });
      this.notifyInitialized();
    }
  }

  private emitToolsListChanged(): void {
    if (!this.capabilities.tools?.listChanged) {
      return;
    }

    this.notificationSubscribers.forEach((handler) => {
      handler({ method: "notifications/tools/list_changed" });
    });
  }

  private emitResourcesListChanged(): void {
    this.notificationSubscribers.forEach((handler) => {
      handler({ method: "notifications/resources/list_changed" });
    });
  }

  private emitPromptsListChanged(): void {
    this.notificationSubscribers.forEach((handler) => {
      handler({ method: "notifications/prompts/list_changed" });
    });
  }

  private registerBuiltinTools(): void {
    this.registerTool(
      {
        name: "nexular.codegen",
        title: "Generate Feature Blueprint",
        description: "Generate a code blueprint for a Nexular feature.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            write: { type: "boolean" },
          },
          required: ["prompt"],
        },
      },
      async (args, ctx) => {
        const prompt = String(args.prompt ?? "").trim();
        if (!prompt) {
          return {
            isError: true,
            content: [{ type: "text", text: "prompt is required" }],
          };
        }

        const generated = this.generateCode(prompt, ctx.projectRoot);
        const write = Boolean(args.write);
        const written = write
          ? this.writeGeneratedCode(generated, ctx.projectRoot)
          : generated.generatedFiles.map((file) => file.filePath);

        return {
          content: [
            {
              type: "text",
              text: `Feature ${generated.featureName} planned with ${written.length} file(s).`,
            },
          ],
          structuredContent: {
            featureName: generated.featureName,
            writtenFiles: written,
            i18nKeys: generated.i18nKeys,
            actionNames: generated.actionNames,
          },
        };
      }
    );

    this.registerTool(
      {
        name: "nexular.architect",
        title: "Analyze Architecture",
        description: "Analyze Nexular architecture quality for a project root.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      async (_args, ctx) => {
        const report = this.analyzeArchitecture(ctx.projectRoot);
        return {
          content: [
            {
              type: "text",
              text: `Architecture score: ${report.score}/100 with ${report.findings.length} finding(s).`,
            },
          ],
          structuredContent: report,
        };
      }
    );

    this.registerTool(
      {
        name: "nexular.perf",
        title: "Analyze Performance",
        description: "Analyze route-level SSR and hydration performance hints.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      async (_args, ctx) => {
        const report = this.analyzePerformance(ctx.projectRoot);
        return {
          content: [
            {
              type: "text",
              text: `Performance report generated for ${report.hints.length} route hint(s).`,
            },
          ],
          structuredContent: report,
        };
      }
    );

    this.registerTool(
      {
        name: "nexular.qa",
        title: "Analyze QA Coverage",
        description: "Analyze route test coverage and suggest QA tasks.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      async (_args, ctx) => {
        const report = this.analyzeQA(ctx.projectRoot);
        return {
          content: [
            {
              type: "text",
              text: `QA report generated with ${report.suggestedTests.length} suggested test(s).`,
            },
          ],
          structuredContent: report,
        };
      }
    );
  }

  private registerBuiltinResources(): void {
    this.registerResource(
      {
        uri: "nexular://project/summary",
        name: "Project Summary",
        description: "High-level summary of Nexular project structure.",
        mimeType: "application/json",
      },
      async (ctx) => {
        const routes = walkFiles(
          path.join(ctx.projectRoot, "src", "app", "routes"),
          (file) => file.endsWith("page.ts") || file.endsWith("page.js")
        );
        const modules = walkFiles(
          path.join(ctx.projectRoot, "src", "app", "modules"),
          (file) => file.endsWith(".component.ts") || file.endsWith(".component.js")
        );

        return {
          contents: [
            {
              uri: "nexular://project/summary",
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  projectRoot: ctx.projectRoot,
                  routes: routes.length,
                  modules: modules.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    this.registerResource(
      {
        uri: "nexular://routes/list",
        name: "Routes List",
        description: "Discovered file-based routes in the project.",
        mimeType: "application/json",
      },
      async (ctx) => {
        const routeFiles = walkFiles(
          path.join(ctx.projectRoot, "src", "app", "routes"),
          (file) => file.endsWith("page.ts") || file.endsWith("page.js")
        );

        const routes = routeFiles.map((file) =>
          path.relative(path.join(ctx.projectRoot, "src", "app", "routes"), file)
        );

        return {
          contents: [
            {
              uri: "nexular://routes/list",
              mimeType: "application/json",
              text: JSON.stringify({ routes }, null, 2),
            },
          ],
        };
      }
    );
  }

  private registerBuiltinPrompts(): void {
    this.registerPrompt(
      {
        name: "nexular.architecture-review",
        title: "Nexular Architecture Review",
        description: "Prompt template for architecture review based on MCP findings.",
        arguments: [
          {
            name: "focus",
            required: false,
            description: "Optional focus area like perf, qa, or security",
          },
        ],
      },
      async (args, ctx) => {
        const focus = String(args.focus ?? "general");
        const report = this.analyzeArchitecture(ctx.projectRoot);

        return {
          messages: [
            {
              role: "system",
              content: {
                type: "text",
                text: "You are a Nexular architecture assistant.",
              },
            },
            {
              role: "user",
              content: {
                type: "text",
                text:
                  `Review this project with focus on ${focus}. ` +
                  `Current architecture score is ${report.score}/100 with ${report.findings.length} findings.`,
              },
            },
          ],
        };
      }
    );

    this.registerPrompt(
      {
        name: "nexular.create-feature",
        title: "Nexular Create Feature",
        description: "Prompt template to request a new feature scaffold.",
        arguments: [
          {
            name: "feature",
            required: true,
            description: "Feature name to scaffold",
          },
        ],
      },
      async (args) => {
        const feature = String(args.feature ?? "feature");

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text:
                  `Crie uma nova feature chamada ${feature} no Nexular. ` +
                  "Inclua rota file-based, componente com hydrate adequado, action tipada e teste SSR.",
              },
            },
          ],
        };
      }
    );
  }
}
