/**
 * Hydration Performance Analytics
 *
 * Provides metrics collection and reporting for island hydration performance.
 * Accessible from both server (via serialization) and client (via browser APIs).
 */

export interface HydrationMetric {
  selector: string;
  time: number;
  size?: number;
  priority?: "critical" | "high" | "normal" | "low";
}

export interface HydrationAnalytics {
  totalTime: number;
  islandCount: number;
  islandsMetrics: HydrationMetric[];
  progressiveEnabled: boolean;
  firstIslandTime?: number;
  bundleSize?: number;
  cacheHitRate?: number;
  timestamp?: number;
}

export interface PerformanceReport {
  hydration: HydrationAnalytics;
  recommendations: string[];
  grade: "A" | "B" | "C" | "D" | "F";
}

/**
 * Generate performance recommendations based on hydration metrics
 */
export function generatePerformanceReport(analytics: HydrationAnalytics): PerformanceReport {
  const recommendations: string[] = [];
  let score = 100;

  // Check total hydration time
  if (analytics.totalTime > 3000) {
    recommendations.push(
      "Hydration taking > 3s. Consider progressive hydration or code splitting."
    );
    score -= 20;
  } else if (analytics.totalTime > 1000) {
    recommendations.push("Hydration taking > 1s. Monitor for performance regressions.");
    score -= 10;
  }

  // Check progressive hydration
  if (!analytics.progressiveEnabled && analytics.islandCount > 3) {
    recommendations.push(
      `Consider enabling progressive hydration for ${analytics.islandCount} islands.`
    );
    score -= 15;
  }

  // Check first island time
  if (analytics.firstIslandTime && analytics.firstIslandTime > 500) {
    recommendations.push("First island hydration > 500ms. Profile component initialization.");
    score -= 10;
  }

  // Check island count
  if (analytics.islandCount > 10) {
    recommendations.push(
      `High island count (${analytics.islandCount}). Consider reducing hydrated components.`
    );
    score -= 5;
  }

  // Check cache effectiveness
  if (analytics.cacheHitRate !== undefined && analytics.cacheHitRate < 50) {
    recommendations.push("Low hydration cache hit rate. Improve cache strategy.");
    score -= 5;
  }

  // Check bundle size
  if (analytics.bundleSize && analytics.bundleSize > 500_000) {
    recommendations.push(
      `Large hydration bundle (${Math.round(analytics.bundleSize / 1024)}kb). Consider code splitting.`
    );
    score -= 10;
  }

  let grade: "A" | "B" | "C" | "D" | "F" = "A";
  if (score < 60) grade = "F";
  else if (score < 70) grade = "D";
  else if (score < 80) grade = "C";
  else if (score < 90) grade = "B";

  return {
    hydration: analytics,
    recommendations,
    grade,
  };
}

/**
 * Format analytics for logging/debugging
 */
export function formatAnalytics(analytics: HydrationAnalytics): string {
  const lines = [
    "╔════════════════════════════════════╗",
    "║  Island Hydration Performance      ║",
    "╚════════════════════════════════════╝",
    `Total Time:        ${analytics.totalTime.toFixed(2)}ms`,
    `Island Count:      ${analytics.islandCount}`,
    `Progressive:       ${analytics.progressiveEnabled ? "✓ Enabled" : "✗ Disabled"}`,
  ];

  if (analytics.firstIslandTime) {
    lines.push(`First Island:      ${analytics.firstIslandTime.toFixed(2)}ms`);
  }

  if (analytics.bundleSize) {
    lines.push(`Bundle Size:       ${(analytics.bundleSize / 1024).toFixed(1)}kb`);
  }

  if (analytics.cacheHitRate !== undefined) {
    lines.push(`Cache Hit Rate:    ${(analytics.cacheHitRate * 100).toFixed(1)}%`);
  }

  if (analytics.islandsMetrics.length > 0) {
    lines.push("\nDetailed Metrics:");
    analytics.islandsMetrics.forEach((m, i) => {
      const priority = m.priority ? ` [${m.priority.toUpperCase()}]` : "";
      lines.push(`  ${i + 1}. ${m.selector}${priority}: ${m.time.toFixed(2)}ms`);
    });
  }

  return lines.join("\n");
}

/**
 * Export analytics to JSON for analysis
 */
export function exportAnalytics(analytics: HydrationAnalytics): string {
  return JSON.stringify(analytics, null, 2);
}
