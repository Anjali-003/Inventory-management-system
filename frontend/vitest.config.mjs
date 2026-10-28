import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// npm test: the screens rendered in a fake browser (jsdom) with a fake API (src/test/fakeApi.js). No backend needed.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    setupFiles: ["./src/test/setup.js"],
    css: false,
    testTimeout: 20_000,
  },
});
