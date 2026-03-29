import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts — Tailwind's Vite plugin is build-only and
// cannot be loaded by vitest's esbuild. This config uses only the React plugin.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
});
