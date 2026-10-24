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

  build: {
    // never ship the source code to the browser in production
    sourcemap: false,
    rolldownOptions: {
      output: {
        // libraries in their own files: they change rarely, so the browser keeps them cached across app updates
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\/](react|react-dom|scheduler|react-router|react-router-dom)[\/]/ },
            { name: "redux", test: /node_modules[\/](@reduxjs|redux|react-redux|immer|reselect)[\/]/ },
            { name: "motion", test: /node_modules[\/](motion|framer-motion|motion-dom|motion-utils)[\/]/ },
            { name: "icons", test: /node_modules[\/]lucide-react[\/]/ },
          ],
        },
      },
    },
  },
});