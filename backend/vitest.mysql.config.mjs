import { defineConfig } from "vitest/config";

// npm run test:mysql: service tests on a throw-away MySQL database (tests/mysql, see tests/helpers/mysqlDb.js).
// Kept out of `npm test` (vitest.config.mjs only takes tests/**/*.test.js) because they need MySQL.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/mysql/**/*.mysql.js"],
    fileParallelism: false, // one copy per file, run one after the other: no two files share a database
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
