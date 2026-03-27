import type { Readable, Writable } from "node:stream";
import { MCPService, type MCPJsonRpcRequest, type MCPJsonRpcResponse } from "./service";

const HEADER_SEPARATOR = "\r\n\r\n";

export function encodeStdioMessage(message: unknown): string {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return `Content-Length: ${body.length}\r\nContent-Type: application/json\r\n\r\n${body.toString("utf8")}`;
}

export class StdioMessageParser {
  private buffer = Buffer.alloc(0);

  feed(chunk: Buffer | string): string[] {
    const incoming = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    this.buffer = Buffer.concat([this.buffer, incoming]);

    const messages: string[] = [];

    while (this.buffer.length > 0) {
      const headerEndIndex = this.buffer.indexOf(HEADER_SEPARATOR);

      if (headerEndIndex === -1) {
        const newlineIndex = this.buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const rawLine = this.buffer.subarray(0, newlineIndex).toString("utf8").trim();
        this.buffer = this.buffer.subarray(newlineIndex + 1);

        if (rawLine.startsWith("{") && rawLine.endsWith("}")) {
          messages.push(rawLine);
        }

        continue;
      }

      const header = this.buffer.subarray(0, headerEndIndex).toString("utf8");
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);

      if (!lengthMatch) {
        this.buffer = this.buffer.subarray(headerEndIndex + HEADER_SEPARATOR.length);
        continue;
      }

      const contentLength = Number(lengthMatch[1]);
      const contentStart = headerEndIndex + HEADER_SEPARATOR.length;
      const totalLength = contentStart + contentLength;

      if (this.buffer.length < totalLength) {
        break;
      }

      const message = this.buffer.subarray(contentStart, totalLength).toString("utf8");
      messages.push(message);
      this.buffer = this.buffer.subarray(totalLength);
    }

    return messages;
  }
}

function isJsonRpcRequest(value: unknown): value is MCPJsonRpcRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === "2.0" && typeof candidate.method === "string";
}

function errorResponse(
  id: string | number | null,
  code: number,
  message: string
): MCPJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  };
}

export function startMCPStdioServer(options?: {
  input?: Readable;
  output?: Writable;
  error?: Writable;
  projectRoot?: string;
  service?: MCPService;
}): () => void {
  const input = options?.input ?? process.stdin;
  const output = options?.output ?? process.stdout;
  const error = options?.error ?? process.stderr;
  const projectRoot = options?.projectRoot ?? process.cwd();
  const service = options?.service ?? new MCPService();
  const parser = new StdioMessageParser();

  const send = (payload: unknown): void => {
    output.write(encodeStdioMessage(payload));
  };

  const onData = async (chunk: Buffer | string): Promise<void> => {
    const rawMessages = parser.feed(chunk);

    for (const rawMessage of rawMessages) {
      let parsed: unknown;

      try {
        parsed = JSON.parse(rawMessage);
      } catch {
        send(errorResponse(null, -32700, "Parse error"));
        return;
      }

      if (!isJsonRpcRequest(parsed)) {
        const maybeId =
          parsed && typeof parsed === "object" && "id" in parsed
            ? ((parsed as Record<string, unknown>).id as string | number | null | undefined)
            : null;
        send(errorResponse(maybeId ?? null, -32600, "Invalid Request"));
        return;
      }

      try {
        const response = await service.handleJsonRpcRequest(parsed, { projectRoot });
        if (response) {
          send(response);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown server error";
        send(errorResponse(parsed.id ?? null, -32000, message));
      }
    }
  };

  const onNotification = (notification: { method: string }): void => {
    send({
      jsonrpc: "2.0",
      method: notification.method,
    });
  };

  const onError = (e: Error): void => {
    error.write(`[nexular-mcp-stdio] ${e.message}\n`);
  };

  const unsubscribeNotification = service.onNotification(onNotification);

  input.on("data", onData);
  input.on("error", onError);

  return () => {
    unsubscribeNotification();
    input.off("data", onData);
    input.off("error", onError);
  };
}
