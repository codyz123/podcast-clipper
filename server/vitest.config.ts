import { defineConfig } from "vitest/config";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Run in Node environment for server tests
    environment: "node",

    // Global test utilities (describe, it, expect without imports)
    globals: true,

    // Setup file for MSW and env vars
    setupFiles: [resolve(__dirname, "__tests__/setup.ts")],

    // Include patterns - use absolute paths
    include: [resolve(__dirname, "__tests__/**/*.test.ts")],

    // Root directory for tests
    root: __dirname,

    // Timeouts
    testTimeout: 30000,
    hookTimeout: 10000,

    // Reporter for verbose output
    reporters: process.env.CI ? ["default", "json"] : ["verbose"],

    // Output file for CI parsing
    outputFile: {
      json: "./__tests__/test-results.json",
    },

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["routes/**/*.ts", "middleware/**/*.ts", "lib/**/*.ts"],
      exclude: ["__tests__/**"],
    },
  },
});
