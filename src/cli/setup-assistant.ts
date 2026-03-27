import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolveMCPHttpOptionsFromEnv, startMCPHttpServer } from "../app/core/mcp/http";
import { startMCPStdioServer } from "../app/core/mcp/stdio";
import { scaffoldNewApp } from "./scaffolder";

export type SupportedStarterTemplate = "minimal" | "full" | "with-auth" | "showcase-i18n";

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((arg) => arg === flag);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

async function promptValue(question: string, fallback: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    return fallback;
  }

  const rl = createInterface({ input, output });
  try {
    const raw = await rl.question(`${question} (${fallback}): `);
    const value = raw.trim();
    return value || fallback;
  } finally {
    rl.close();
  }
}

export async function runAppSetupAssistant(args: string[]): Promise<void> {
  const providedName = getFlagValue(args, "--name");
  const providedTemplate = getFlagValue(args, "--template") as SupportedStarterTemplate | undefined;

  const name = providedName ?? (await promptValue("Nome do projeto", "nexular-starter-app"));

  const templateCandidate =
    providedTemplate ??
    ((await promptValue(
      "Template (minimal|full|with-auth|showcase-i18n)",
      "showcase-i18n"
    )) as SupportedStarterTemplate);

  const template: SupportedStarterTemplate = [
    "minimal",
    "full",
    "with-auth",
    "showcase-i18n",
  ].includes(templateCandidate)
    ? templateCandidate
    : "showcase-i18n";

  const projectPath = scaffoldNewApp(name, { template });

  output.write(`\n✓ Starter criado: ${projectPath}\n`);
  output.write(`✓ Template: ${template}\n`);
  output.write("\nPróximos passos:\n");
  output.write(`  cd ${name}\n`);
  output.write("  npm install\n");
  output.write("  npm run dev\n\n");
}

export async function runMCPSetupAssistant(args: string[]): Promise<void> {
  const transportFlag = getFlagValue(args, "--transport");
  const startNow = args.includes("--start");
  const transport =
    transportFlag ?? (await promptValue("Transporte MCP (stdio|http)", "http")).toLowerCase();

  if (transport === "stdio") {
    output.write("\nConfiguração recomendada (stdio):\n");
    output.write("  comando: nexular mcp stdio\n");
    output.write("  uso: ideal para integração local com IDE/agentes\n");

    if (startNow) {
      startMCPStdioServer({
        projectRoot: process.env.NEXULAR_MCP_PROJECT_ROOT ?? process.cwd(),
      });
    }

    return;
  }

  const host = getFlagValue(args, "--host") ?? (await promptValue("Host MCP HTTP", "127.0.0.1"));
  const portRaw = getFlagValue(args, "--port") ?? (await promptValue("Porta MCP HTTP", "3334"));
  const endpointPath = getFlagValue(args, "--path") ?? (await promptValue("Path MCP HTTP", "/mcp"));
  const authBearer = getFlagValue(args, "--auth-bearer");

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error("Porta inválida para MCP HTTP. Use valor entre 1 e 65535.");
  }

  output.write("\nConfiguração recomendada (http):\n");
  output.write(`  endpoint: http://${host}:${port}${endpointPath}\n`);
  output.write("  readiness: GET /ready\n");
  if (authBearer) {
    output.write("  auth: bearer habilitado\n");
  } else {
    output.write("  auth: desabilitado (recomendado habilitar em produção)\n");
  }

  if (startNow) {
    const envOptions = resolveMCPHttpOptionsFromEnv();
    await startMCPHttpServer({
      host,
      port,
      path: endpointPath,
      auth: {
        bearerToken: authBearer ?? envOptions.auth?.bearerToken,
      },
      cors: envOptions.cors,
      security: envOptions.security,
      projectRoot: process.env.NEXULAR_MCP_PROJECT_ROOT ?? process.cwd(),
      logger: (message) => output.write(`${message}\n`),
    });
  }
}
