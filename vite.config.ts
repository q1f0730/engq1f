import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/**
 * 生成 service worker：预缓存构建产物（app shell）+ 词库数据。
 * 版本号取自产物哈希，发布新版自动替换旧缓存。
 */
function serviceWorker(): Plugin {
  return {
    name: "cet4v-sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "sw.js");
      const extra = ["./", "index.html", "data/cet4.json", "manifest.webmanifest", "icon.svg"];
      const precache = [...new Set([...extra, ...files])];
      const hash = createHash("sha1")
        .update(files.sort().join("|"))
        .update(readFileSync("public/data/cet4.json"))
        .digest("hex")
        .slice(0, 10);
      const tpl = readFileSync("src/sw-template.js", "utf8")
        .replace("__VERSION__", hash)
        .replace("__PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source: tpl });
    },
  };
}

/**
 * React + Vite 构建配置
 *
 * 硬约束：
 * - dev server 必须监听 3015 + strictPort（沙箱只开放一个代理端口）
 * - outDir 'dist' / assetsDir 'assets' — 归一化产物目录
 */
export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    tsConfigPaths(),
    serviceWorker(),
  ],
  server: {
    host: "0.0.0.0",
    port: 3015,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
  },
  preview: {
    host: "0.0.0.0",
    port: 3015,
    strictPort: true,
    allowedHosts: true,
  },
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
} as import("vite").UserConfig & { test: unknown });
