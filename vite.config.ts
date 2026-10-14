import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { defineConfig, loadEnv, type Plugin, type Rollup } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
// 11.3 · 词库大小在构建时写进代码：欢迎页 / 引导不用等 1.2MB 的词库下载完就能显示
// 13.0 · 基础词（b）默认隐藏：首屏显示的词数不算它们
const words = (JSON.parse(readFileSync(new URL("./public/data/cet4.json", import.meta.url), "utf8")) as { c?: 1; b?: 1 }[]).filter((w) => !w.b);

/**
 * 生成 service worker：预缓存构建产物（app shell）+ 词库数据。
 * 版本号取自产物哈希，发布新版自动替换旧缓存。
 */
function serviceWorker(): Plugin {
  return {
    name: "cet4v-sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "sw.js" && f !== "version.json");
      const extra = ["./", "index.html", "data/cet4.json", "data/syn.json", "manifest.webmanifest", "icon.svg", "fonts/instrument-serif-latin-400-normal.woff2", "fonts/instrument-serif-latin-400-italic.woff2", "fonts/noto-serif-sc-heading-600.woff2"];
      const precache = [...new Set([...extra, ...files])];
      const hash = createHash("sha1")
        .update(files.sort().join("|"))
        .update(readFileSync("public/data/cet4.json"))
        .update(readFileSync("public/data/syn.json"))
        // 13.0 · 例句分片换了也要换缓存版本（它们是空闲时由页面让 SW 存进同一个缓存的）
        .update(readdirSync("public/data/ex").sort().map((f) => readFileSync(`public/data/ex/${f}`)).join("|"))
        .digest("hex")
        .slice(0, 10);
      const tpl = readFileSync("src/sw-template.js", "utf8")
        .replace("__VERSION__", hash)
        .replace("__PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source: tpl });
      // 13.0 · 更新提示：页面回到前台时取 version.json，比当前版本新就提示刷新
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: pkg.version, sw: hash }) });
    },
  };
}

/**
 * 11.3 · 还没完成引导的新用户：HTML 一到就并行预加载欢迎页的代码块（不用等入口脚本跑起来再去要），
 * 慢网下欢迎页早几秒能点。已经在用的人不预加载（不占首页的流量）。
 */
function welcomePreload(): Plugin {
  return {
    name: "cet4v-welcome-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c): c is Rollup.OutputChunk => c.type === "chunk");
        const welcome = chunks.find((c) => Object.keys(c.modules).some((m) => /routes\/welcome\.tsx\?tsr-split/.test(m)));
        if (!welcome) return html;
        const files = new Set<string>();
        const walk = (c: Rollup.OutputChunk) => {
          if (c.isEntry || files.has(c.fileName)) return;
          files.add(c.fileName);
          for (const f of c.imports) {
            const d = bundle[f];
            if (d && d.type === "chunk") walk(d);
          }
        };
        walk(welcome);
        const list = JSON.stringify([...files]);
        const script = `<script>(function(){try{var s=localStorage.getItem('cet4v-state-v1');if(s&&/"onboarded"\\s*:\\s*true/.test(s))return;}catch(e){}${list}.forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href='./'+f;document.head.appendChild(l);});})();</script>`;
        return html.replace("</head>", `    ${script}\n  </head>`);
      },
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
/**
 * 13.0 · 云同步配置（见 docs/cloud.md、docs/deploy-cloudflare.md）：构建时读环境变量（.env 文件或托管平台的环境变量都行）
 * 13.0.0 · 两个独立站点，构建时用 BACKEND 选后端（账号、数据互不相通）：
 *  - BACKEND=supabase（默认）：SUPABASE_URL + SUPABASE_ANON_KEY（或 VITE_ 前缀）都在 → 开云同步，直连 Meoo Cloud（gz58y2647ucx.meoo.run）；
 *    CET4V_CLOUD=1 且只有 key 没有 URL → 同域 /sb-api（Meoo 自带的代理）。
 *  - BACKEND=cloudflare：同域 /api（functions/ + D1，watercoloreyes.cn）。不编进任何 Supabase 地址 / key，产物里也没有 supabase-js。
 *  - CET4V_CLOUD=0 → 强制关（纯本机版）。
 * anon key 本来就是公开的（RLS 把关），service role key 永远不进前端。
 */
const env = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", process.cwd(), "");
const backend = (process.env.BACKEND || env.BACKEND || "supabase").toLowerCase();
if (backend !== "supabase" && backend !== "cloudflare") throw new Error(`BACKEND must be supabase or cloudflare, got ${backend}`);
const sbUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
const sbKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
const cloud =
  backend === "cloudflare"
    ? { on: env.CET4V_CLOUD !== "0", backend, url: "", key: "" }
    : (() => {
        const on = env.CET4V_CLOUD === "0" ? false : !!sbKey && (!!sbUrl || env.CET4V_CLOUD === "1");
        return { on, backend, url: on ? sbUrl : "", key: on ? sbKey : "" };
      })();

export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    tsConfigPaths(),
    serviceWorker(),
    welcomePreload(),
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
    __CLOUD__: JSON.stringify(cloud),
    __WORDS_ALL__: JSON.stringify(words.length),
    __WORDS_CORE__: JSON.stringify(words.filter((w) => w.c).length),
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
        // 11.3 · 图标合成一个块：不再是几十个 0.2KB 的小文件（慢网下每个请求都要多等一个往返，HTTP/1.1 同时只开 6 个连接）
        manualChunks(id) {
          if (id.includes("lucide-react")) return "icons";
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
} as import("vite").UserConfig & { test: unknown });
