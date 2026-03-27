export type LogLevel = "info" | "warn" | "error";

export function logStructured(
  level: LogLevel,
  event: string,
  details: Record<string, unknown>,
): void {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production";
}

export function formatPublicErrorMessage(error: unknown): string {
  if (isProductionLike()) {
    return "Algo deu errado ao processar esta pagina.";
  }

  return error instanceof Error ? error.message : "Unknown rendering error";
}
