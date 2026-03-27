#!/usr/bin/env node
import { startMCPStdioServer } from "../app/core/mcp/stdio";

startMCPStdioServer({
  projectRoot: process.env.NEXULAR_MCP_PROJECT_ROOT ?? process.cwd(),
});
