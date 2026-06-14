import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev, proxy /api to the Fastify server so the frontend only ever talks to
// our own HTTP/JSON API (browsers can't speak IMAP/SMTP — see CLAUDE.md).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
