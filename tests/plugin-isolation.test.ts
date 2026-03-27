import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PluginIsolationManager,
  VMContextPluginSandbox,
  getPluginIsolationManager,
  resetPluginIsolationManager,
} from "../src/server/plugin-isolation";

describe("Plugin Isolation - VM Context Sandbox", () => {
  it("should execute plugin code in isolated context", async () => {
    const pluginCode = `
      module.exports = {
        add(a, b) { return a + b; },
        greet(name) { return 'Hello, ' + name; }
      };
    `;

    const sandbox = new VMContextPluginSandbox(pluginCode);
    const result1 = await sandbox.call("add", [5, 3]);
    const result2 = await sandbox.call("greet", ["World"]);

    expect(result1).toBe(8);
    expect(result2).toBe("Hello, World");
  });

  it("should prevent access to restricted globals", async () => {
    const pluginCode = `
      module.exports = {
        tryAccessFS() { 
          try { 
            return require('fs').readFileSync('/etc/passwd', 'utf8'); 
          } catch { 
            return 'blocked'; 
          } 
        },
        tryAccessProcess() {
          try {
            return process.exit;
          } catch {
            return 'blocked';
          }
        }
      };
    `;

    const sandbox = new VMContextPluginSandbox(pluginCode);
    const fsResult = await sandbox.call("tryAccessFS");
    const processResult = await sandbox.call("tryAccessProcess");

    expect(fsResult).toBe("blocked");
    expect(processResult).toBe("blocked");
  });

  it("should timeout long-running plugin code", async () => {
    const pluginCode = `
      module.exports = {
        slowMethod() {
          const start = Date.now();
          while (Date.now() - start < 10000) {}
          return 'done';
        }
      };
    `;

    const sandbox = new VMContextPluginSandbox(pluginCode);

    await expect(sandbox.call("slowMethod", [], 100)).rejects.toThrow();
  });

  it("should provide safe console access", async () => {
    const consoleLogs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      consoleLogs.push(args.join(" "));
    };

    try {
      const pluginCode = `
        module.exports = {
          log() { 
            console.log('test message'); 
            return true;
          }
        };
      `;

      const sandbox = new VMContextPluginSandbox(pluginCode);
      await sandbox.call("log");

      expect(consoleLogs.some((log) => log.includes("[plugin]"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("should allow specific globals when specified", async () => {
    const pluginCode = `
      module.exports = {
        useMath() { return Math.PI; },
        useJSON() { return JSON.stringify({a: 1}); }
      };
    `;

    const sandbox = new VMContextPluginSandbox(pluginCode, ["Math", "JSON"]);
    const piResult = await sandbox.call("useMath");
    const jsonResult = await sandbox.call("useJSON");

    expect(piResult).toBeCloseTo(3.14159, 4);
    expect(jsonResult).toBe('{"a":1}');
  });

  it("should handle plugin errors", async () => {
    const pluginCode = `
      module.exports = {
        throwError() { throw new Error('Plugin error'); }
      };
    `;

    const sandbox = new VMContextPluginSandbox(pluginCode);

    await expect(sandbox.call("throwError")).rejects.toThrow("Plugin error");
  });
});

describe("Plugin Isolation - Manager", () => {
  let manager: PluginIsolationManager;

  beforeEach(() => {
    resetPluginIsolationManager();
    manager = getPluginIsolationManager();
  });

  afterEach(async () => {
    await manager.cleanupAll();
  });

  it("should create and reuse VM context sandboxes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-isolation-"));
    const pluginPath = path.join(tempDir, "test-plugin.js");

    fs.writeFileSync(
      pluginPath,
      `
      module.exports = {
        getValue() { return 42; }
      };
    `,
      "utf8"
    );

    const sandbox1 = await manager.getSandbox("plugin1", pluginPath, "vm-context");
    const sandbox2 = await manager.getSandbox("plugin1", pluginPath, "vm-context");

    expect(sandbox1).toBe(sandbox2);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should execute isolated plugin calls", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-exec-"));
    const pluginPath = path.join(tempDir, "exec-plugin.js");

    fs.writeFileSync(
      pluginPath,
      `
      module.exports = {
        compute(x, y) { return x * y + 10; }
      };
    `,
      "utf8"
    );

    await manager.getSandbox("calc-plugin", pluginPath, "vm-context");

    const result = await manager.execute("calc-plugin", "compute", [5, 3], 5000);

    expect(result.success).toBe(true);
    expect(result.data).toBe(25);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should track plugin metrics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-metrics-"));
    const pluginPath = path.join(tempDir, "metric-plugin.js");

    fs.writeFileSync(
      pluginPath,
      `
      module.exports = {
        work() { return 'ok'; }
      };
    `,
      "utf8"
    );

    await manager.getSandbox("metric-plugin", pluginPath, "vm-context");

    // Execute multiple calls
    await manager.execute("metric-plugin", "work", [], 5000);
    await manager.execute("metric-plugin", "work", [], 5000);

    const metrics = manager.getMetrics("metric-plugin");

    expect(metrics).not.toBeNull();
    expect(metrics?.calls).toBe(2);
    expect(metrics?.failures).toBe(0);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should count failures in metrics", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-fail-"));
    const pluginPath = path.join(tempDir, "fail-plugin.js");

    fs.writeFileSync(
      pluginPath,
      `
      module.exports = {
        fail() { throw new Error('intentional'); }
      };
    `,
      "utf8"
    );

    await manager.getSandbox("fail-plugin", pluginPath, "vm-context");

    await manager.execute("fail-plugin", "fail", [], 5000);
    const metrics = manager.getMetrics("fail-plugin");

    expect(metrics?.failures).toBe(1);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should cleanup individual plugin sandboxes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-cleanup-"));
    const pluginPath = path.join(tempDir, "cleanup-plugin.js");

    fs.writeFileSync(pluginPath, `module.exports = { test() { return true; } };`, "utf8");

    await manager.getSandbox("cleanup-plugin", pluginPath, "vm-context");
    let metrics = manager.getMetrics("cleanup-plugin");
    expect(metrics).not.toBeNull();

    await manager.cleanup("cleanup-plugin");
    metrics = manager.getMetrics("cleanup-plugin");
    expect(metrics).toBeNull();

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should handle plugin execution timeout", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-timeout-"));
    const pluginPath = path.join(tempDir, "timeout-plugin.js");

    fs.writeFileSync(
      pluginPath,
      `
      module.exports = {
        slow() { 
          const start = Date.now();
          while (Date.now() - start < 5000) {}
          return 'done';
        }
      };
    `,
      "utf8"
    );

    await manager.getSandbox("timeout-plugin", pluginPath, "vm-context");

    const result = await manager.execute("timeout-plugin", "slow", [], 100);

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });

  it("should handle non-existent sandbox gracefully", async () => {
    const result = await manager.execute("nonexistent", "method", [], 5000);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not initialized");
  });

  it("should isolate multiple plugins independently", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexular-multi-"));
    const plugin1Path = path.join(tempDir, "plugin1.js");
    const plugin2Path = path.join(tempDir, "plugin2.js");

    fs.writeFileSync(plugin1Path, `module.exports = { getValue() { return 1; } };`, "utf8");
    fs.writeFileSync(plugin2Path, `module.exports = { getValue() { return 2; } };`, "utf8");

    await manager.getSandbox("p1", plugin1Path, "vm-context");
    await manager.getSandbox("p2", plugin2Path, "vm-context");

    const result1 = await manager.execute("p1", "getValue", [], 5000);
    const result2 = await manager.execute("p2", "getValue", [], 5000);

    expect(result1.data).toBe(1);
    expect(result2.data).toBe(2);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true });
  });
});
