import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/agent": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/.well-known": "http://localhost:3000",
    },
  },
});
