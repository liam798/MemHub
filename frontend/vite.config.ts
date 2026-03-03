import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const MEMHUB_ORIGIN_PLACEHOLDER = "__MEMHUB_ORIGIN__";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "skill-md-utf8",
      configureServer(server) {
        const skillHandler = (req: any, res: any, next: () => void) => {
          if (req.url === "/skill.md" || req.url?.startsWith("/skill.md?")) {
            const file = resolve(process.cwd(), "public/skill.md");
            let body = readFileSync(file, "utf-8");
            const host = req.headers.host || "localhost:3000";
            const protocol =
              (req.headers["x-forwarded-proto"] as string) === "https"
                ? "https"
                : "http";
            const origin = `${protocol}://${host}`;
            body = body.replace(new RegExp(MEMHUB_ORIGIN_PLACEHOLDER, "g"), origin);
            res.setHeader("Content-Type", "text/markdown; charset=utf-8");
            res.setHeader("Cache-Control", "public, max-age=0");
            res.end(body);
            return;
          }
          next();
        };
        server.middlewares.stack.unshift({ route: "", handle: skillHandler });
      },
      writeBundle() {
        const out = resolve(process.cwd(), "dist/skill.md");
        const file = resolve(process.cwd(), "public/skill.md");
        let body = readFileSync(file, "utf-8");
        const origin =
          process.env.VITE_MEMHUB_ORIGIN || MEMHUB_ORIGIN_PLACEHOLDER;
        body = body.replace(new RegExp(MEMHUB_ORIGIN_PLACEHOLDER, "g"), origin);
        writeFileSync(out, body, "utf-8");
      },
    },
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
