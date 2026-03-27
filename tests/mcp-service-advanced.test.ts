import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { MCPService } from "../src/app/core/mcp/service";

describe("MCP advanced capabilities", () => {
  const projectRoot = process.cwd();

  it("should produce codegen blueprint", () => {
    const mcp = new MCPService();
    const result = mcp.generateCode("criar dashboard", projectRoot);

    expect(result.featureName).toBe("dashboard");
    expect(result.generatedFiles.length).toBeGreaterThan(0);
    expect(result.actionNames).toContain("submit");
    expect(result.i18nKeys).toContain("dashboard.title");
  });

  it("should analyze architecture and performance", () => {
    const mcp = new MCPService();
    const architecture = mcp.analyzeArchitecture(projectRoot);
    const performance = mcp.analyzePerformance(projectRoot);

    expect(architecture.score).toBeGreaterThanOrEqual(0);
    expect(architecture.score).toBeLessThanOrEqual(100);
    expect(performance.hints.length).toBeGreaterThan(0);
  });

  it("should generate QA suggestions", () => {
    const mcp = new MCPService();
    const qa = mcp.analyzeQA(projectRoot);

    expect(Array.isArray(qa.findings)).toBe(true);
    expect(Array.isArray(qa.suggestedTests)).toBe(true);
  });

  it("should write generated files when requested", () => {
    const mcp = new MCPService();
    const result = mcp.generateCode("criar feature analytics", projectRoot);
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-mcp-"));

    const rewritten = {
      ...result,
      generatedFiles: result.generatedFiles.map((file) => ({
        ...file,
        filePath: path.join(path.basename(tmpRoot), path.basename(file.filePath)),
      })),
    };

    const written = mcp.writeGeneratedCode(rewritten, path.dirname(tmpRoot));
    expect(written.length).toBe(rewritten.generatedFiles.length);

    const fullPath = path.join(path.dirname(tmpRoot), written[0]);
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it("should support MCP lifecycle initialize and tool discovery", () => {
    const mcp = new MCPService();

    const init = mcp.initialize({
      protocolVersion: "2025-06-18",
      capabilities: { elicitation: {} },
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    mcp.notifyInitialized();

    const lifecycle = mcp.getLifecycleState();
    const tools = mcp.listTools();

    expect(init.protocolVersion).toBe("2025-06-18");
    expect(lifecycle.initialized).toBe(true);
    expect(lifecycle.initializedByClient).toBe(true);
    expect(tools.some((tool) => tool.name === "nexular.codegen")).toBe(true);
  });

  it("should execute MCP tool calls", async () => {
    const mcp = new MCPService();
    mcp.initialize({
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    mcp.notifyInitialized();

    const result = await mcp.callTool("nexular.codegen", {
      prompt: "criar profile",
      write: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toBeDefined();
  });

  it("should emit tools list changed notification", () => {
    const mcp = new MCPService();
    const notifications: string[] = [];

    const unsubscribe = mcp.onNotification((notification) => {
      notifications.push(notification.method);
    });

    mcp.registerTool(
      {
        name: "nexular.temp",
        title: "Temp",
        description: "temporary test tool",
        inputSchema: { type: "object", properties: {} },
      },
      async () => ({
        content: [{ type: "text", text: "ok" }],
      })
    );

    mcp.unregisterTool("nexular.temp");
    unsubscribe();

    expect(
      notifications.filter((method) => method === "notifications/tools/list_changed").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("should list and read MCP resources", async () => {
    const mcp = new MCPService();
    mcp.initialize({
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    mcp.notifyInitialized();

    const resources = mcp.listResources();
    expect(resources.some((resource) => resource.uri === "nexular://project/summary")).toBe(true);

    const summary = await mcp.readResource("nexular://project/summary", {
      projectRoot,
    });
    expect(summary.contents[0].uri).toBe("nexular://project/summary");
    expect(summary.contents[0].text).toContain("projectRoot");
  });

  it("should list and get MCP prompts", async () => {
    const mcp = new MCPService();
    mcp.initialize({
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    mcp.notifyInitialized();

    const prompts = mcp.listPrompts();
    expect(prompts.some((prompt) => prompt.name === "nexular.architecture-review")).toBe(true);

    const prompt = await mcp.getPrompt("nexular.create-feature", {
      feature: "payments",
    });
    expect(prompt.messages[0].content.text).toContain("payments");
  });

  it("should handle MCP JSON-RPC requests", async () => {
    const mcp = new MCPService();

    const initResponse = await mcp.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "jsonrpc-client", version: "1.0.0" },
      },
    });

    expect(initResponse?.result).toBeDefined();

    await mcp.handleJsonRpcRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    const toolsListResponse = await mcp.handleJsonRpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect((toolsListResponse?.result as { tools: unknown[] }).tools.length).toBeGreaterThan(0);
  });
});
