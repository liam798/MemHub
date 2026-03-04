import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    host: true, // 监听 0.0.0.0，支持 127.0.0.1、localhost 及本机 IP 访问
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/skill.md": {
        target: "http://localhost:8000",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host || "localhost:3100";
            proxyReq.setHeader("X-Forwarded-Host", host);
            const proto = req.headers["x-forwarded-proto"] ?? (req.socket?.encrypted ? "https" : "http");
            proxyReq.setHeader("X-Forwarded-Proto", proto);
          });
        },
      },
    },
  },
});
