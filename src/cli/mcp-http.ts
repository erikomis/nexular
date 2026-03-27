#!/usr/bin/env node
import { resolveMCPHttpOptionsFromEnv, startMCPHttpServer } from "../app/core/mcp/http";

const host = process.env.NEXULAR_MCP_HTTP_HOST ?? "127.0.0.1";
const port = Number(process.env.NEXULAR_MCP_HTTP_PORT ?? 3334);
const path = process.env.NEXULAR_MCP_HTTP_PATH ?? "/mcp";

startMCPHttpServer({
  host,
  port,
  path,
  ...resolveMCPHttpOptionsFromEnv(),
  projectRoot: process.env.NEXULAR_MCP_PROJECT_ROOT ?? process.cwd(),
  logger: (message) => {
    process.stdout.write(`${message}\n`);
  },
}).catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`[nexular-mcp-http] ${message}\n`);
  process.exitCode = 1;
});
