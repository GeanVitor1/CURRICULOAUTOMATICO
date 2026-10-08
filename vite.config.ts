import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ command }) => {
  if (command === "build") process.env.NODE_ENV = "production";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:3001" },
    },
    build: { chunkSizeWarningLimit: 650 },
    test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
  } as any;
});
