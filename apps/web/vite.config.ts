import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],

    server: {
      port: 5173,
      proxy: {
        // In dev: Vite proxies /api/* to wrangler dev (port 8787).
        // Browser sees only one origin (localhost:5173) — no CORS.
        // In prod: VITE_API_URL is baked into the bundle at build time.
        "/api": {
          target: env.VITE_API_DEV_URL ?? "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
