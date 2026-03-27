import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthServiceWithDefaults, type RouteContext } from "../src/app/core/auth/strategies";
import { applyAuthPlugins, resetAuthPluginLoader } from "../src/server/auth-plugin-loader";
import { resetRuntimeConfigCache } from "../src/server/runtime-config";

function contextWithHeaders(headers: Record<string, string | undefined>): RouteContext {
  return {
    path: "/",
    locale: "en",
    searchParams: new URLSearchParams(),
    params: {},
    request: { headers },
  };
}

function signature(content: string, secret: string): string {
  return crypto
    .createHash("sha256")
    .update(content + secret)
    .digest("hex");
}

describe("Auth plugin loader", () => {
  it("should load external plugin from runtime config", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent = `module.exports = {\n  name: \"allow-header\",\n  register(service) {\n    service.register({\n      name: \"allow-header\",\n      authorize(ctx) {\n        return { ok: (ctx.request && ctx.request.headers && ctx.request.headers[\"x-allow\"]) === \"1\" };\n      },\n    });\n  },\n};\n`;

    fs.writeFileSync(path.join(pluginDir, "allow-header.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            plugins: ["bearer", "api-key"],
            pluginDirectory: pluginDir,
            pluginWhitelist: ["allow-header"],
            externalPlugins: [
              {
                name: "allow-header",
                file: "allow-header.plugin.js",
                enabled: true,
              },
            ],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    const denied = await auth.authorize("allow-header", contextWithHeaders({ "x-allow": "0" }));
    const allowed = await auth.authorize("allow-header", contextWithHeaders({ "x-allow": "1" }));

    expect(denied.ok).toBe(false);
    expect(allowed.ok).toBe(true);

    const metric = auth.getMetrics().find((item) => item.strategy === "allow-header");
    expect(metric?.plugin).toBe("allow-header");
    expect(metric?.calls).toBe(2);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should reject plugin with invalid signature", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-sign-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent = `module.exports = { name: \"signed-plugin\", register(service) { service.register({ name: \"signed-plugin\", authorize() { return { ok: true }; } }); } };`;
    fs.writeFileSync(path.join(pluginDir, "signed.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            plugins: ["bearer", "api-key"],
            pluginDirectory: pluginDir,
            pluginWhitelist: ["signed-plugin"],
            pluginSignatureSecret: "secret",
            externalPlugins: [
              {
                name: "signed-plugin",
                file: "signed.plugin.js",
                signature: signature(pluginContent, "wrong-secret"),
              },
            ],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("signed-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should reject plugin with invalid shape (missing register)", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-bad-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent = `module.exports = { name: "bad-plugin" };`; // Missing register method
    fs.writeFileSync(path.join(pluginDir, "bad.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            externalPlugins: [{ name: "bad-plugin", file: "bad.plugin.js", enabled: true }],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("bad-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should skip disabled plugins", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-disabled-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent = `module.exports = { name: "disabled-plugin", register(service) { service.register({ name: "disabled-plugin", authorize() { return { ok: true }; } }); } };`;
    fs.writeFileSync(path.join(pluginDir, "disabled.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            externalPlugins: [
              { name: "disabled-plugin", file: "disabled.plugin.js", enabled: false },
            ],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("disabled-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should handle plugin throws exception during register", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-throw-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent = `module.exports = { name: "throw-plugin", register(service) { throw new Error("Initialization failed"); } };`;
    fs.writeFileSync(path.join(pluginDir, "throw.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            externalPlugins: [{ name: "throw-plugin", file: "throw.plugin.js", enabled: true }],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    expect(() => applyAuthPlugins(auth)).toThrow();

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should reject plugin if file does not exist", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-notfound-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            externalPlugins: [{ name: "missing-plugin", file: "missing.plugin.js", enabled: true }],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("missing-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should filter plugins by whitelist", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-whitelist-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const plugin1Content = `module.exports = { name: "whitelisted-plugin", register(service) { service.register({ name: "whitelisted-plugin", authorize() { return { ok: true }; } }); } };`;
    const plugin2Content = `module.exports = { name: "blacklisted-plugin", register(service) { service.register({ name: "blacklisted-plugin", authorize() { return { ok: true }; } }); } };`;

    fs.writeFileSync(path.join(pluginDir, "whitelisted.plugin.js"), plugin1Content, "utf8");
    fs.writeFileSync(path.join(pluginDir, "blacklisted.plugin.js"), plugin2Content, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            pluginWhitelist: ["whitelisted-plugin"],
            externalPlugins: [
              { name: "whitelisted-plugin", file: "whitelisted.plugin.js", enabled: true },
              { name: "blacklisted-plugin", file: "blacklisted.plugin.js", enabled: true },
            ],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("whitelisted-plugin")).toBe(true);
    expect(auth.hasPlugin("blacklisted-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should handle malformed plugin exports", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-malform-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent = `module.exports = { name: \"malformed-plugin\" };`; // Missing register method
    fs.writeFileSync(path.join(pluginDir, "malformed.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            externalPlugins: [
              { name: "malformed-plugin", file: "malformed.plugin.js", enabled: true },
            ],
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("malformed-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should enforce strict trust policy using trusted publishers", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-trust-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const trustedContent =
      'module.exports = { name: "trusted-plugin", register(service) { service.register({ name: "trusted-plugin", authorize() { return { ok: true }; } }); } };';
    const untrustedContent =
      'module.exports = { name: "untrusted-plugin", register(service) { service.register({ name: "untrusted-plugin", authorize() { return { ok: true }; } }); } };';

    fs.writeFileSync(path.join(pluginDir, "trusted.plugin.js"), trustedContent, "utf8");
    fs.writeFileSync(path.join(pluginDir, "untrusted.plugin.js"), untrustedContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            trustedPublishers: ["nexular-labs"],
            externalPlugins: [
              {
                name: "trusted-plugin",
                file: "trusted.plugin.js",
                publisher: "nexular-labs",
              },
              {
                name: "untrusted-plugin",
                file: "untrusted.plugin.js",
                publisher: "external-vendor",
              },
            ],
          },
          security: {
            pluginTrustMode: "strict",
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("trusted-plugin")).toBe(true);
    expect(auth.hasPlugin("untrusted-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });

  it("should block denylisted plugins regardless of signature or trust", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-plugin-deny-"));
    const pluginDir = path.join(tempRoot, "plugins");
    fs.mkdirSync(pluginDir, { recursive: true });

    const pluginContent =
      'module.exports = { name: "blocked-plugin", register(service) { service.register({ name: "blocked-plugin", authorize() { return { ok: true }; } }); } };';
    fs.writeFileSync(path.join(pluginDir, "blocked.plugin.js"), pluginContent, "utf8");

    const runtimeConfigPath = path.join(tempRoot, "runtime.json");
    fs.writeFileSync(
      runtimeConfigPath,
      JSON.stringify({
        default: {
          auth: {
            pluginDirectory: pluginDir,
            pluginDenyList: ["blocked-plugin"],
            externalPlugins: [
              {
                name: "blocked-plugin",
                file: "blocked.plugin.js",
                publisher: "nexular-labs",
                enabled: true,
              },
            ],
          },
          security: {
            pluginTrustMode: "strict",
          },
        },
      }),
      "utf8"
    );

    process.env.NEXULAR_RUNTIME_CONFIG_PATH = runtimeConfigPath;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();

    const auth = createAuthServiceWithDefaults();
    applyAuthPlugins(auth);

    expect(auth.hasPlugin("blocked-plugin")).toBe(false);

    delete process.env.NEXULAR_RUNTIME_CONFIG_PATH;
    resetRuntimeConfigCache();
    resetAuthPluginLoader();
  });
});
