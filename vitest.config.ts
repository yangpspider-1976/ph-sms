import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      // `server-only` is a Next.js build guard with no runtime behaviour.
      "server-only": resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    pool: "forks",
    // The integration tests share one database and truncate it between cases,
    // so files must not run at the same time or they wipe each other's rows.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
