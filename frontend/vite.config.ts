import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "spa-fallback",
      configureServer(server) {
        return () => {
          server.middlewares.use((req, _res, next) => {
            if (req.method !== "GET" && req.method !== "HEAD") return next();
            const raw = req.url || "";
            const pathOnly = raw.split("?")[0];
            const qs = raw.includes("?")
              ? "?" + raw.split("?").slice(1).join("?")
              : "";
            if (pathOnly.startsWith("/api")) return next();
            if (pathOnly.startsWith("/@") || pathOnly.startsWith("/node_modules"))
              return next();
            if (/\.\w+$/.test(pathOnly)) return next();
            if (pathOnly === "/" || pathOnly === "/index.html") return next();
            req.url = "/index.html" + qs;
            next();
          });
        };
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          pdf: ["pdfjs-dist"],
        },
      },
    },
  },
});
