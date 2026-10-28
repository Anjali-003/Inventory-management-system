import { defineConfig } from "vitest/config";

// npm run e2e: the whole order flow on a throw-away copy of the database (tests/e2e). Kept out of `npm test`
// (vitest.config.mjs only takes tests/**/*.test.js) because it is slow and needs MySQL.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.js"],
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
