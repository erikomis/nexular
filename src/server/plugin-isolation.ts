/**
 * Plugin Isolation & Sandboxing
 * Provides Web Worker and V8 Isolate-based plugin execution
 */

import { Worker } from "node:worker_threads";
import path from "node:path";
import { EventEmitter } from "node:events";

export type PluginIsolationPolicy = "worker-thread" | "v8-isolate" | "vm-context" | "none";

export type IsolatedPluginResult = {
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
};

export type PluginMessage = {
  id: string;
  method: string;
  args: any[];
  timeout?: number;
};

export type PluginResponse = {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
};

/**
 * Worker-threaded plugin sandbox
 */
export class WorkerThreadPluginSandbox extends EventEmitter {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, any>();
  private nextId = 0;
  private policy: PluginIsolationPolicy;
  private resourceLimits: {
    maxOldGenerationSizeMb?: number;
    maxYoungGenerationSizeMb?: number;
    stackSizeMb?: number;
  };

  constructor(
    private pluginPath: string,
    policy: PluginIsolationPolicy = "worker-thread",
    resourceLimits?: WorkerThreadPluginSandbox["resourceLimits"]
  ) {
    super();
    this.policy = policy;
    this.resourceLimits = resourceLimits || {
      maxOldGenerationSizeMb: 128,
      maxYoungGenerationSizeMb: 64,
      stackSizeMb: 4,
    };
  }

  /**
   * Initialize the worker thread
   */
  async initialize(): Promise<void> {
    if (this.worker) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(this.pluginPath, {
          resourceLimits: this.resourceLimits,
        });

        this.worker.on("message", (msg: PluginResponse) => {
          const request = this.pendingRequests.get(msg.id);
          if (!request) return;

          this.pendingRequests.delete(msg.id);

          if (msg.success) {
            request.resolve(msg.data);
          } else {
            request.reject(new Error(msg.error || "Plugin execution failed"));
          }
        });

        this.worker.on("error", (error) => {
          this.emit("error", error);
          reject(error);
        });

        this.worker.on("exit", (code) => {
          if (code !== 0) {
            this.emit("exit", code);
            reject(new Error(`Worker exited with code ${code}`));
          }
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Call plugin method in isolated worker
   */
  async call(method: string, args: any[] = [], timeout = 5000): Promise<any> {
    if (!this.worker) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const id = String(this.nextId++);
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Plugin call timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (data: any) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      const message: PluginMessage = { id, method, args, timeout };
      this.worker!.postMessage(message);
    });
  }

  /**
   * Terminate worker and cleanup
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      this.pendingRequests.clear();
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * VM Context sandbox (basic containment)
 */
export class VMContextPluginSandbox extends EventEmitter {
  private context: Record<string, any> = {};
  private moduleExports: Record<string, any> = {};
  private vmContext: any = null;

  constructor(
    private pluginCode: string,
    private allowedGlobals: string[] = []
  ) {
    super();
    this.initializeContext();
  }

  private initializeContext(): void {
    // Create a restricted context
    const vm = require("vm");

    // Create a module-like object for plugin code to export functions
    const moduleObj: { exports: Record<string, any> } = { exports: {} };

    // Allow only specified globals
    this.context = {
      console: {
        log: (...args: any[]) => console.log("[plugin]", ...args),
        error: (...args: any[]) => console.error("[plugin]", ...args),
        warn: (...args: any[]) => console.warn("[plugin]", ...args),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      parseFloat,
      parseInt,
      module: moduleObj,
      exports: moduleObj.exports,
    };

    for (const global of this.allowedGlobals) {
      if (global in globalThis && global !== "module") {
        this.context[global] = (globalThis as any)[global];
      }
    }

    try {
      this.vmContext = vm.createContext(this.context);
      vm.runInContext(this.pluginCode, this.vmContext, {
        timeout: 5000,
      });
      // Capture the exported methods from the module
      this.moduleExports = moduleObj.exports;
    } catch (error) {
      throw new Error(`Failed to initialize plugin sandbox: ${error}`);
    }
  }

  /**
   * Call plugin method in VM context
   */
  async call(method: string, args: any[] = [], timeout = 5000): Promise<any> {
    const fn = this.moduleExports[method];
    if (!this.vmContext || !fn || typeof fn !== "function") {
      throw new Error(`Method "${method}" not found in plugin exports`);
    }

    try {
      const vm = require("vm");
      const methodName = JSON.stringify(method);
      this.context.__pluginArgs = args;

      const result = vm.runInContext(
        `module.exports[${methodName}](...__pluginArgs)`,
        this.vmContext,
        { timeout }
      );

      if (!result || typeof result.then !== "function") {
        delete this.context.__pluginArgs;
        return result;
      }

      const callPromise = Promise.resolve(result);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Plugin call timeout after ${timeout}ms`)), timeout)
      );

      const resolved = await Promise.race([callPromise, timeoutPromise]);
      delete this.context.__pluginArgs;
      return resolved;
    } catch (error) {
      delete this.context.__pluginArgs;
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("timed out")) {
        throw new Error(`Plugin call timeout after ${timeout}ms`);
      }
      throw new Error(`Plugin execution error: ${message}`);
    }
  }
}

/**
 * Plugin isolation manager
 */
export class PluginIsolationManager {
  private sandboxes = new Map<string, WorkerThreadPluginSandbox | VMContextPluginSandbox>();
  private metrics = new Map<string, { calls: number; failures: number; totalTime: number }>();

  /**
   * Create or get sandbox for plugin
   */
  async getSandbox(
    pluginId: string,
    pluginPath: string,
    policy: PluginIsolationPolicy = "worker-thread"
  ): Promise<WorkerThreadPluginSandbox | VMContextPluginSandbox> {
    let sandbox = this.sandboxes.get(pluginId);

    if (!sandbox) {
      if (policy === "worker-thread") {
        sandbox = new WorkerThreadPluginSandbox(pluginPath, policy);
        await (sandbox as WorkerThreadPluginSandbox).initialize();
      } else {
        // For VM context, we need to load and read the plugin code
        const fs = require("fs");
        const pluginCode = fs.readFileSync(pluginPath, "utf8");
        sandbox = new VMContextPluginSandbox(pluginCode);
      }

      this.sandboxes.set(pluginId, sandbox);
      this.metrics.set(pluginId, { calls: 0, failures: 0, totalTime: 0 });
    }

    return sandbox;
  }

  /**
   * Execute isolated plugin call
   */
  async execute(
    pluginId: string,
    method: string,
    args: any[] = [],
    timeout = 5000
  ): Promise<IsolatedPluginResult> {
    const startTime = Date.now();
    const sandbox = this.sandboxes.get(pluginId);

    if (!sandbox) {
      return {
        success: false,
        error: `Sandbox not initialized for plugin "${pluginId}"`,
        executionTime: 0,
      };
    }

    const metrics = this.metrics.get(pluginId)!;
    metrics.calls++;

    try {
      const result = await sandbox.call(method, args, timeout);
      const executionTime = Date.now() - startTime;
      metrics.totalTime += executionTime;

      return {
        success: true,
        data: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      metrics.failures++;

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      };
    }
  }

  /**
   * Get plugin metrics
   */
  getMetrics(pluginId: string): { calls: number; failures: number; totalTime: number } | null {
    return this.metrics.get(pluginId) || null;
  }

  /**
   * Cleanup plugin sandbox
   */
  async cleanup(pluginId: string): Promise<void> {
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox && sandbox instanceof WorkerThreadPluginSandbox) {
      await (sandbox as WorkerThreadPluginSandbox).terminate();
    }
    this.sandboxes.delete(pluginId);
    this.metrics.delete(pluginId);
  }

  /**
   * Cleanup all sandboxes
   */
  async cleanupAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [pluginId, sandbox] of this.sandboxes) {
      if (sandbox instanceof WorkerThreadPluginSandbox) {
        promises.push((sandbox as WorkerThreadPluginSandbox).terminate());
      }
    }

    await Promise.all(promises);
    this.sandboxes.clear();
    this.metrics.clear();
  }
}

/**
 * Create global plugin isolation manager instance
 */
let isolationManager: PluginIsolationManager | null = null;

export function getPluginIsolationManager(): PluginIsolationManager {
  if (!isolationManager) {
    isolationManager = new PluginIsolationManager();
  }
  return isolationManager;
}

export function resetPluginIsolationManager(): void {
  isolationManager = null;
}
