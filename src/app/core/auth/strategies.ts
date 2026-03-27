import type { RouteContext } from "../server-actions";

export type AuthResult = {
  ok: boolean;
  reason?: string;
};

export type AuthStrategy = {
  name: string;
  authorize: (
    ctx: RouteContext,
    options?: Record<string, unknown>,
  ) => Promise<AuthResult> | AuthResult;
};

export type AuthPlugin = {
  name: string;
  register: (service: AuthService) => void;
};

export type AuthMetric = {
  strategy: string;
  plugin: string;
  calls: number;
  successes: number;
  failures: number;
  avgLatencyMs: number;
  lastError?: string;
};

export class AuthService {
  private readonly strategies = new Map<string, AuthStrategy>();
  private readonly plugins = new Map<string, AuthPlugin>();
  private readonly strategyOwners = new Map<string, string>();
  private readonly metrics = new Map<string, AuthMetric>();
  private activePluginRegistration: string | null = null;

  register(strategy: AuthStrategy): void {
    this.strategies.set(strategy.name, strategy);

    const owner = this.activePluginRegistration ?? "core";
    this.strategyOwners.set(strategy.name, owner);

    if (!this.metrics.has(strategy.name)) {
      this.metrics.set(strategy.name, {
        strategy: strategy.name,
        plugin: owner,
        calls: 0,
        successes: 0,
        failures: 0,
        avgLatencyMs: 0,
      });
    }
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }

  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  registerPlugin(plugin: AuthPlugin): void {
    this.plugins.set(plugin.name, plugin);
    this.activePluginRegistration = plugin.name;
    try {
      plugin.register(this);
    } finally {
      this.activePluginRegistration = null;
    }
  }

  getMetrics(): AuthMetric[] {
    return Array.from(this.metrics.values()).map((metric) => ({ ...metric }));
  }

  resetMetrics(): void {
    this.metrics.forEach((metric) => {
      metric.calls = 0;
      metric.successes = 0;
      metric.failures = 0;
      metric.avgLatencyMs = 0;
      metric.lastError = undefined;
    });
  }

  async authorize(
    name: string,
    ctx: RouteContext,
    options?: Record<string, unknown>,
  ): Promise<AuthResult> {
    const strategy = this.strategies.get(name);

    if (!strategy) {
      return { ok: false, reason: `Auth strategy not found: ${name}` };
    }

    const startedAt = Date.now();
    const metric = this.metrics.get(name);

    try {
      const result = await strategy.authorize(ctx, options);

      if (metric) {
        metric.calls += 1;
        if (result.ok) {
          metric.successes += 1;
        } else {
          metric.failures += 1;
          metric.lastError = result.reason;
        }
        const elapsed = Date.now() - startedAt;
        metric.avgLatencyMs =
          (metric.avgLatencyMs * (metric.calls - 1) + elapsed) / metric.calls;
      }

      return result;
    } catch (error) {
      if (metric) {
        metric.calls += 1;
        metric.failures += 1;
        metric.lastError =
          error instanceof Error ? error.message : "Unknown auth error";
        const elapsed = Date.now() - startedAt;
        metric.avgLatencyMs =
          (metric.avgLatencyMs * (metric.calls - 1) + elapsed) / metric.calls;
      }

      throw error;
    }
  }
}

export const bearerAuthStrategy: AuthStrategy = {
  name: "bearer",
  authorize: (ctx, options) => {
    const header = ctx.request?.headers?.authorization ?? "";
    const requiredPrefix = String(options?.requiredPrefix ?? "Bearer ");

    if (!header.startsWith(requiredPrefix)) {
      return { ok: false, reason: "Missing bearer authorization" };
    }

    return { ok: true };
  },
};

export const apiKeyAuthStrategy: AuthStrategy = {
  name: "api-key",
  authorize: (ctx, options) => {
    const expected = String(options?.key ?? "");
    const header = ctx.request?.headers?.["x-api-key"] ?? "";

    if (!expected) {
      return { ok: false, reason: "API key strategy misconfigured" };
    }

    if (header !== expected) {
      return { ok: false, reason: "Invalid API key" };
    }

    return { ok: true };
  },
};

export function createInternalTokenPlugin(expectedToken: string): AuthPlugin {
  return {
    name: "internal-token",
    register: (service: AuthService) => {
      service.register({
        name: "internal-token",
        authorize: (ctx) => {
          const token = ctx.request?.headers?.["x-internal-token"] ?? "";
          if (!expectedToken) {
            return { ok: false, reason: "Internal token plugin misconfigured" };
          }

          if (token !== expectedToken) {
            return { ok: false, reason: "Invalid internal token" };
          }

          return { ok: true };
        },
      });
    },
  };
}

export function createAuthServiceWithDefaults(): AuthService {
  const service = new AuthService();
  service.register(bearerAuthStrategy);
  service.register(apiKeyAuthStrategy);
  return service;
}
