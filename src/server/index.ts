/**
 * Server Module Exports
 * All server-side utilities and interfaces
 */

// SSR State Management
export {
  SSRState,
  SSRStateBuilder,
  createSSRStateManager,
  type SerializationSchema,
  type SerializationRule,
} from "./ssr-state";

// Streaming SSR
export {
  StreamingSSRRenderer,
  ProgressiveRenderingPipeline,
  createProgressiveRenderer,
  type StreamingChunk,
} from "./streaming-ssr";

// Plugin Isolation
export {
  PluginIsolationManager,
  WorkerThreadPluginSandbox,
  VMContextPluginSandbox,
  getPluginIsolationManager,
  resetPluginIsolationManager,
  type PluginIsolationPolicy,
  type IsolatedPluginResult,
  type PluginMessage,
  type PluginResponse,
} from "./plugin-isolation";

// Auth & Config
export { applyAuthPlugins, resetAuthPluginLoader } from "./auth-plugin-loader";
export { loadRuntimeConfig, resetRuntimeConfigCache } from "./runtime-config";

// Router
export { createRouteContext, resolveRoute, resolveMiddlewaresForPath } from "./file-router";

// Logging
export { logStructured } from "./logger";

// Route Rules
export { applyRouteRules } from "./route-rules";

// Renderer
export type { CacheInvalidationScope, RenderedDocument, ServerCacheStats } from "./renderer";
export {
  clearServerCaches,
  getServerCacheStats,
  invalidateRouteCache,
  invalidateTagCache,
  renderDocument,
} from "./renderer";
