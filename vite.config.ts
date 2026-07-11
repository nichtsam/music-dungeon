/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const headers: Record<string, string> = {};
  if (env.CYANITE_API_KEY) headers["x-api-key"] = env.CYANITE_API_KEY;
  return {
    plugins: [react()],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
    server: {
      proxy: {
        "/api": {
          target: env.CYANITE_API_URL || "http://localhost:9030",
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api/, ""),
          headers,
        },
      },
    },
  };
});
