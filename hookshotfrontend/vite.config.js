import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: { plugins: [tailwindcss(), autoprefixer()] },
  },
  server: {
    port: 5173,
    // Same-origin by design: the proxy is what lets the httpOnly cookie work in
    // dev, since a cross-origin XHR would need SameSite=None and Secure.
    // ponytail: one hardcoded target matching the backend's PORT. Override with
    // VITE_API_ORIGIN only if you move the API off 5001.
    proxy: { "/api": { target: process.env.VITE_API_ORIGIN ?? "http://localhost:5001", changeOrigin: true } },
  },
});