import { AuthService, createInternalTokenPlugin } from "../app/core/auth/strategies";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadRuntimeConfig, resetRuntimeConfigCache } from "./runtime-config";
import { logStructured } from "./logger";

let authPluginsLoaded = false;

function hmacSignature(content: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(content).digest("hex");
}

function loadExternalPlugins(auth: AuthService): void {
  const config = loadRuntimeConfig();
  const pluginDirectory = config.auth?.pluginDirectory;
  const whitelist = new Set(config.auth?.pluginWhitelist ?? []);
  const denylist = new Set(config.auth?.pluginDenyList ?? []);
  const trustedPlugins = new Set(config.auth?.trustedPlugins ?? []);
  const trustedPublishers = new Set(config.auth?.trustedPublishers ?? []);
  const strictTrustMode = config.security?.pluginTrustMode === "strict";
  const hasWhitelist = whitelist.size > 0;
  const signatureSecret = config.auth?.pluginSignatureSecret;
  const requireSignature =
    config.security?.requirePluginSignature ||
    (process.env.NODE_ENV ?? "development") === "production";

  const declaredPlugins = (config.auth?.externalPlugins ?? []).filter(
    (entry) => entry.enabled !== false
  );

  for (const plugin of declaredPlugins) {
    if (denylist.has(plugin.name)) {
      logStructured("warn", "auth.plugin.skipped_denylisted", {
        plugin: plugin.name,
      });
      continue;
    }

    if (hasWhitelist && !whitelist.has(plugin.name)) {
      logStructured("warn", "auth.plugin.skipped_not_whitelisted", {
        plugin: plugin.name,
      });
      continue;
    }

    if (strictTrustMode) {
      const trustedByName = trustedPlugins.has(plugin.name);
      const trustedByPublisher =
        typeof plugin.publisher === "string" && trustedPublishers.has(plugin.publisher);

      if (!trustedByName && !trustedByPublisher) {
        logStructured("warn", "auth.plugin.skipped_untrusted", {
          plugin: plugin.name,
          publisher: plugin.publisher,
          mode: "strict",
        });
        continue;
      }
    }

    if (auth.hasPlugin(plugin.name)) {
      continue;
    }

    const baseDir = pluginDirectory || path.join(process.cwd(), "plugins", "auth");
    const resolvedBaseDir = path.isAbsolute(baseDir)
      ? baseDir
      : path.resolve(process.cwd(), baseDir);
    const pluginPath = path.isAbsolute(plugin.file)
      ? plugin.file
      : path.resolve(resolvedBaseDir, plugin.file);

    if (!fs.existsSync(pluginPath)) {
      logStructured("warn", "auth.plugin.file_missing", {
        plugin: plugin.name,
        file: pluginPath,
      });
      continue;
    }

    const source = fs.readFileSync(pluginPath, "utf8");

    if (requireSignature && !plugin.signature) {
      logStructured("warn", "auth.plugin.signature_required", {
        plugin: plugin.name,
      });
      continue;
    }

    if (plugin.signature) {
      if (!signatureSecret) {
        logStructured("warn", "auth.plugin.signature_secret_missing", {
          plugin: plugin.name,
        });
        continue;
      }

      const computed = hmacSignature(source, signatureSecret);
      if (computed !== plugin.signature) {
        logStructured("warn", "auth.plugin.invalid_signature", {
          plugin: plugin.name,
        });
        continue;
      }
    }

    const imported = require(pluginPath);
    const loaded = imported.default ?? imported.plugin ?? imported;

    if (!loaded || typeof loaded.register !== "function") {
      logStructured("warn", "auth.plugin.invalid_shape", {
        plugin: plugin.name,
      });
      continue;
    }

    auth.registerPlugin(loaded);
    logStructured("info", "auth.plugin.loaded", {
      plugin: plugin.name,
      publisher: plugin.publisher,
      file: pluginPath,
    });
  }
}

export function applyAuthPlugins(auth: AuthService): void {
  if (authPluginsLoaded) {
    return;
  }

  const config = loadRuntimeConfig();
  const plugins = config.auth?.plugins ?? ["bearer", "api-key"];

  if (plugins.includes("internal-token")) {
    const token = config.auth?.internalToken ?? "";
    if (!auth.hasPlugin("internal-token")) {
      auth.registerPlugin(createInternalTokenPlugin(token));
    }
  }

  loadExternalPlugins(auth);

  authPluginsLoaded = true;
}

export function resetAuthPluginLoader(): void {
  authPluginsLoaded = false;
  resetRuntimeConfigCache();
}
