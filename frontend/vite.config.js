import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import viteQRCode from "vite-qr";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteQRCode(),
  ],

  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});