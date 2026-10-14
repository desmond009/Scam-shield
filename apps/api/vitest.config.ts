import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["test/globalSetup.ts"],
    setupFiles: ["test/setup.ts"],
    // Integration tests share one Postgres database and Redis DB, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
