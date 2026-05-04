import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
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
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
