import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // esbuild handles the React 19 automatic JSX runtime; no plugin-react needed
  // (and it avoids a vite-version peer clash with vitest's bundled vite).
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
