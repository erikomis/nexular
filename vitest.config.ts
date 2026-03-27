import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["node_modules/", "dist/", "tests/", "src/main.ts", "src/cli/index.ts", "**/*.d.ts"],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
});
