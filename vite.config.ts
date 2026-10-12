import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ command }) => {
  if (command === "build") process.env.NODE_ENV = "production";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      fs: {
        deny: [
          ".env", ".env.*", "*.{crt,pem}", "**/.git/**",
          "**/google-client.local.json", "**/client_secret*.json", "**/.data/**",
        ],
      },
      proxy: {
        "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
      },
    },
    build: { chunkSizeWarningLimit: 650 },
    test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
  };
});
