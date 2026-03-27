import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  StdioMessageParser,
  encodeStdioMessage,
  startMCPStdioServer,
} from "../src/app/core/mcp/stdio";

describe("MCP stdio transport", () => {
  it("should parse framed and line-delimited messages", () => {
    const parser = new StdioMessageParser();

    const framed = encodeStdioMessage({ jsonrpc: "2.0", id: 1, method: "ping" });
    const framedMessages = parser.feed(framed);
    expect(framedMessages.length).toBe(1);

    const lineMessages = parser.feed('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    expect(lineMessages.length).toBe(1);
  });

  it("should handle initialize and tools/list over stdio", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const errors = new PassThrough();

    const outputParser = new StdioMessageParser();
    const responses: Array<Record<string, unknown>> = [];

    output.on("data", (chunk) => {
      const payloads = outputParser.feed(chunk as Buffer);
      payloads.forEach((payload) => {
        responses.push(JSON.parse(payload) as Record<string, unknown>);
      });
    });

    const stop = startMCPStdioServer({
      input,
      output,
      error: errors,
      projectRoot: process.cwd(),
    });

    input.write(
      encodeStdioMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "stdio-test", version: "1.0.0" },
        },
      })
    );

    input.write(
      encodeStdioMessage({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })
    );

    input.write(
      encodeStdioMessage({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    stop();

    const initResponse = responses.find((response) => response.id === 1);
    const toolsListResponse = responses.find((response) => response.id === 2);

    expect(initResponse).toBeDefined();
    expect(toolsListResponse).toBeDefined();

    const toolsResult = toolsListResponse?.result as
      | { tools?: Array<{ name: string }> }
      | undefined;
    expect(Array.isArray(toolsResult?.tools)).toBe(true);
    expect(toolsResult?.tools?.some((tool) => tool.name === "nexular.codegen")).toBe(true);
  });
});
