import fs from "node:fs";
import path from "node:path";

export type RuntimeRouteRule = {
  from: string;
  rewrite?: string;
  redirect?: {
    to: string;
    status?: 301 | 302 | 307 | 308;
  };
};

export type RuntimeConfigShape = {
  routeRules?: RuntimeRouteRule[];
  auth?: {
    plugins?: string[];
    internalToken?: string;
    apiKey?: string;
    pluginDirectory?: string;
    pluginWhitelist?: string[];
    pluginDenyList?: string[];
    trustedPlugins?: string[];
    trustedPublishers?: string[];
    pluginSignatureSecret?: string;
    externalPlugins?: Array<{
      name: string;
      file: string;
      publisher?: string;
      signature?: string;
      enabled?: boolean;
    }>;
  };
  security?: {
    corsAllowList?: string[];
    requirePluginSignature?: boolean;
    observabilityToken?: string;
    pluginTrustMode?: "permissive" | "strict";
  };
};

export type RuntimeFileShape = {
  default?: RuntimeConfigShape;
  environments?: Record<string, RuntimeConfigShape>;
};

let runtimeConfigCache: RuntimeConfigShape | null = null;

class ConfigValidationError extends Error {
  constructor(path: string, message: string) {
    super(`Runtime config validation error at '${path}': ${message}`);
    this.name = "ConfigValidationError";
  }
}

function validateRouteRule(rule: unknown, index: number): void {
  if (!rule || typeof rule !== "object") {
    throw new ConfigValidationError(`routeRules[${index}]`, "must be an object");
  }

  const r = rule as Record<string, unknown>;
  if (!r.from || typeof r.from !== "string") {
    throw new ConfigValidationError(`routeRules[${index}].from`, "must be a non-empty string");
  }

  if (r.rewrite && typeof r.rewrite !== "string") {
    throw new ConfigValidationError(`routeRules[${index}].rewrite`, "must be a string");
  }

  if (r.redirect) {
    if (typeof r.redirect !== "object") {
      throw new ConfigValidationError(`routeRules[${index}].redirect`, "must be an object");
    }

    const redir = r.redirect as Record<string, unknown>;
    if (!redir.to || typeof redir.to !== "string") {
      throw new ConfigValidationError(
        `routeRules[${index}].redirect.to`,
        "must be a non-empty string"
      );
    }

    if (redir.status && ![301, 302, 307, 308].includes(redir.status as number)) {
      throw new ConfigValidationError(
        `routeRules[${index}].redirect.status`,
        "must be 301, 302, 307, or 308"
      );
    }
  }
}

function validateAuthConfig(auth: unknown, scope: string): void {
  if (!auth || typeof auth !== "object") {
    throw new ConfigValidationError(scope, "auth must be an object");
  }

  const a = auth as Record<string, unknown>;

  if (a.plugins) {
    if (!Array.isArray(a.plugins)) {
      throw new ConfigValidationError(`${scope}.plugins`, "must be an array of strings");
    }
    a.plugins.forEach((p, idx) => {
      if (typeof p !== "string") {
        throw new ConfigValidationError(
          `${scope}.plugins[${idx}]`,
          `must be a string, got ${typeof p}`
        );
      }
    });
  }

  if (a.pluginDirectory && typeof a.pluginDirectory !== "string") {
    throw new ConfigValidationError(`${scope}.pluginDirectory`, "must be a string path");
  }

  if (a.pluginWhitelist) {
    if (!Array.isArray(a.pluginWhitelist)) {
      throw new ConfigValidationError(`${scope}.pluginWhitelist`, "must be an array of strings");
    }
  }

  if (a.pluginDenyList && !Array.isArray(a.pluginDenyList)) {
    throw new ConfigValidationError(`${scope}.pluginDenyList`, "must be an array of strings");
  }

  if (a.trustedPlugins && !Array.isArray(a.trustedPlugins)) {
    throw new ConfigValidationError(`${scope}.trustedPlugins`, "must be an array of strings");
  }

  if (a.trustedPublishers && !Array.isArray(a.trustedPublishers)) {
    throw new ConfigValidationError(`${scope}.trustedPublishers`, "must be an array of strings");
  }

  if (a.externalPlugins) {
    if (!Array.isArray(a.externalPlugins)) {
      throw new ConfigValidationError(`${scope}.externalPlugins`, "must be an array");
    }
    a.externalPlugins.forEach((p, idx) => {
      if (typeof p !== "object" || !p) {
        throw new ConfigValidationError(`${scope}.externalPlugins[${idx}]`, "must be an object");
      }
      const plugin = p as Record<string, unknown>;
      if (!plugin.name || typeof plugin.name !== "string") {
        throw new ConfigValidationError(
          `${scope}.externalPlugins[${idx}].name`,
          "must be a non-empty string"
        );
      }
      if (!plugin.file || typeof plugin.file !== "string") {
        throw new ConfigValidationError(
          `${scope}.externalPlugins[${idx}].file`,
          "must be a non-empty string"
        );
      }
      if (
        typeof plugin.publisher !== "undefined" &&
        (typeof plugin.publisher !== "string" || plugin.publisher.trim().length === 0)
      ) {
        throw new ConfigValidationError(
          `${scope}.externalPlugins[${idx}].publisher`,
          "must be a non-empty string"
        );
      }
    });
  }
}

function validateSecurityConfig(security: unknown, scope: string): void {
  if (!security || typeof security !== "object") {
    throw new ConfigValidationError(scope, "security must be an object");
  }

  const s = security as Record<string, unknown>;

  if (s.corsAllowList) {
    if (!Array.isArray(s.corsAllowList)) {
      throw new ConfigValidationError(`${scope}.corsAllowList`, "must be an array of URLs");
    }
    s.corsAllowList.forEach((url, idx) => {
      if (typeof url !== "string") {
        throw new ConfigValidationError(
          `${scope}.corsAllowList[${idx}]`,
          `must be a string URL, got ${typeof url}`
        );
      }
      try {
        new URL(url);
      } catch {
        throw new ConfigValidationError(
          `${scope}.corsAllowList[${idx}]`,
          `invalid URL format: ${url}`
        );
      }
    });
  }

  if (
    typeof s.requirePluginSignature !== "undefined" &&
    typeof s.requirePluginSignature !== "boolean"
  ) {
    throw new ConfigValidationError(`${scope}.requirePluginSignature`, "must be a boolean");
  }

  if (
    typeof s.pluginTrustMode !== "undefined" &&
    s.pluginTrustMode !== "permissive" &&
    s.pluginTrustMode !== "strict"
  ) {
    throw new ConfigValidationError(`${scope}.pluginTrustMode`, "must be 'permissive' or 'strict'");
  }
}

function parseJsonFile(filePath: string): RuntimeFileShape | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf8");

  try {
    const parsed = JSON.parse(raw) as RuntimeFileShape;

    if (parsed.default?.routeRules) {
      if (!Array.isArray(parsed.default.routeRules)) {
        throw new ConfigValidationError("default.routeRules", "must be an array");
      }
      parsed.default.routeRules.forEach((rule, idx) => {
        validateRouteRule(rule, idx);
      });
    }

    if (parsed.default?.auth) {
      validateAuthConfig(parsed.default.auth, "default.auth");
    }

    if (parsed.default?.security) {
      validateSecurityConfig(parsed.default.security, "default.security");
    }

    if (parsed.environments) {
      Object.entries(parsed.environments).forEach(([env, config]) => {
        if (config.routeRules) {
          if (!Array.isArray(config.routeRules)) {
            throw new ConfigValidationError(`environments[${env}].routeRules`, "must be an array");
          }
          config.routeRules.forEach((rule, idx) => {
            validateRouteRule(rule, idx);
          });
        }

        if (config.auth) {
          validateAuthConfig(config.auth, `environments[${env}].auth`);
        }

        if (config.security) {
          validateSecurityConfig(config.security, `environments[${env}].security`);
        }
      });
    }

    return parsed;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new ConfigValidationError(filePath, `Invalid JSON: ${error.message}`);
    }
    throw new ConfigValidationError(
      filePath,
      `Failed to parse: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

function mergeConfig(base: RuntimeConfigShape, extra: RuntimeConfigShape): RuntimeConfigShape {
  return {
    routeRules: extra.routeRules ?? base.routeRules,
    auth: {
      plugins: extra.auth?.plugins ?? base.auth?.plugins,
      internalToken: extra.auth?.internalToken ?? base.auth?.internalToken,
      apiKey: extra.auth?.apiKey ?? base.auth?.apiKey,
      pluginDirectory: extra.auth?.pluginDirectory ?? base.auth?.pluginDirectory,
      pluginWhitelist: extra.auth?.pluginWhitelist ?? base.auth?.pluginWhitelist,
      pluginDenyList: extra.auth?.pluginDenyList ?? base.auth?.pluginDenyList,
      trustedPlugins: extra.auth?.trustedPlugins ?? base.auth?.trustedPlugins,
      trustedPublishers: extra.auth?.trustedPublishers ?? base.auth?.trustedPublishers,
      pluginSignatureSecret: extra.auth?.pluginSignatureSecret ?? base.auth?.pluginSignatureSecret,
      externalPlugins: extra.auth?.externalPlugins ?? base.auth?.externalPlugins,
    },
    security: {
      corsAllowList: extra.security?.corsAllowList ?? base.security?.corsAllowList,
      requirePluginSignature:
        extra.security?.requirePluginSignature ?? base.security?.requirePluginSignature,
      observabilityToken: extra.security?.observabilityToken ?? base.security?.observabilityToken,
      pluginTrustMode: extra.security?.pluginTrustMode ?? base.security?.pluginTrustMode,
    },
  };
}

function parseEnvRouteRules(): RuntimeRouteRule[] | undefined {
  const raw = process.env.NEXULAR_ROUTE_RULES_JSON;
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as RuntimeRouteRule[];
}

export function loadRuntimeConfig(forceRefresh = false): RuntimeConfigShape {
  if (!forceRefresh && runtimeConfigCache) {
    return runtimeConfigCache;
  }

  const env = process.env.NEXULAR_ENV || process.env.NODE_ENV || "development";
  const runtimePath =
    process.env.NEXULAR_RUNTIME_CONFIG_PATH || path.join(process.cwd(), "nexular.runtime.json");

  let config: RuntimeConfigShape = {
    routeRules: undefined,
    auth: {
      plugins: ["bearer", "api-key"],
      pluginDirectory: path.join(process.cwd(), "plugins", "auth"),
      pluginWhitelist: undefined,
      pluginDenyList: undefined,
      trustedPlugins: undefined,
      trustedPublishers: undefined,
      pluginSignatureSecret: undefined,
      externalPlugins: [],
    },
    security: {
      corsAllowList: undefined,
      requirePluginSignature: false,
      observabilityToken: undefined,
      pluginTrustMode: "permissive",
    },
  };

  const runtimeFile = parseJsonFile(runtimePath);
  if (runtimeFile?.default) {
    config = mergeConfig(config, runtimeFile.default);
  }

  if (runtimeFile?.environments?.[env]) {
    config = mergeConfig(config, runtimeFile.environments[env]);
  }

  const envRules = parseEnvRouteRules();
  if (envRules) {
    config.routeRules = envRules;
  }

  if (process.env.NEXULAR_AUTH_PLUGINS) {
    config.auth = {
      ...config.auth,
      plugins: process.env.NEXULAR_AUTH_PLUGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  if (process.env.NEXULAR_AUTH_INTERNAL_TOKEN) {
    config.auth = {
      ...config.auth,
      internalToken: process.env.NEXULAR_AUTH_INTERNAL_TOKEN,
    };
  }

  if (process.env.NEXULAR_AUTH_API_KEY) {
    config.auth = {
      ...config.auth,
      apiKey: process.env.NEXULAR_AUTH_API_KEY,
    };
  }

  if (process.env.NEXULAR_AUTH_PLUGIN_DIR) {
    config.auth = {
      ...config.auth,
      pluginDirectory: process.env.NEXULAR_AUTH_PLUGIN_DIR,
    };
  }

  if (process.env.NEXULAR_AUTH_PLUGIN_WHITELIST) {
    config.auth = {
      ...config.auth,
      pluginWhitelist: process.env.NEXULAR_AUTH_PLUGIN_WHITELIST.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  if (process.env.NEXULAR_AUTH_PLUGIN_DENYLIST) {
    config.auth = {
      ...config.auth,
      pluginDenyList: process.env.NEXULAR_AUTH_PLUGIN_DENYLIST.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  if (process.env.NEXULAR_AUTH_PLUGIN_TRUSTED_PLUGINS) {
    config.auth = {
      ...config.auth,
      trustedPlugins: process.env.NEXULAR_AUTH_PLUGIN_TRUSTED_PLUGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  if (process.env.NEXULAR_AUTH_PLUGIN_TRUSTED_PUBLISHERS) {
    config.auth = {
      ...config.auth,
      trustedPublishers: process.env.NEXULAR_AUTH_PLUGIN_TRUSTED_PUBLISHERS.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  if (process.env.NEXULAR_AUTH_PLUGIN_SIGNATURE_SECRET) {
    config.auth = {
      ...config.auth,
      pluginSignatureSecret: process.env.NEXULAR_AUTH_PLUGIN_SIGNATURE_SECRET,
    };
  }

  if (process.env.NEXULAR_SECURITY_CORS_ALLOW_LIST) {
    config.security = {
      ...config.security,
      corsAllowList: process.env.NEXULAR_SECURITY_CORS_ALLOW_LIST.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  if (process.env.NEXULAR_SECURITY_REQUIRE_PLUGIN_SIGNATURE) {
    config.security = {
      ...config.security,
      requirePluginSignature: process.env.NEXULAR_SECURITY_REQUIRE_PLUGIN_SIGNATURE === "true",
    };
  }

  if (process.env.NEXULAR_OBSERVABILITY_TOKEN) {
    config.security = {
      ...config.security,
      observabilityToken: process.env.NEXULAR_OBSERVABILITY_TOKEN,
    };
  }

  if (process.env.NEXULAR_SECURITY_PLUGIN_TRUST_MODE) {
    const mode = process.env.NEXULAR_SECURITY_PLUGIN_TRUST_MODE;
    if (mode === "permissive" || mode === "strict") {
      config.security = {
        ...config.security,
        pluginTrustMode: mode,
      };
    }
  }

  runtimeConfigCache = config;
  return config;
}

export function resetRuntimeConfigCache(): void {
  runtimeConfigCache = null;
}
