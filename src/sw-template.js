/* 四级单词打卡 · service worker（构建时由 vite.config.ts 生成 sw.js） */
const VERSION = "__VERSION__";
const CACHE = "cet4v-" + VERSION;
const PRECACHE = __PRECACHE__;
// 发音缓存跨版本保留：听过的词离线也能播
const AUDIO_CACHE = "cet4v-audio";
const AUDIO_MAX = 150;
const AUDIO_RE = /^https:\/\/dict\.youdao\.com\/dictvoice\b/;

self.addEventListener("install", (event) => {
  // 不自动 skipWaiting：有旧版在控制页面时，新版进入 waiting，由页面提示"有新版本，点击刷新"
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: "reload" })))));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  // 13.0 · 页面空闲时让 SW 把例句分片（data/ex/*.json）存进当前版本的缓存：离线也有例句，安装时不多下 480KB
  if (event.data && event.data.type === "CACHE_URLS" && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((u) => typeof u === "string" && /^data\/ex\/[a-z_]\.json$/.test(u));
    event.waitUntil(
      caches.open(CACHE).then((c) =>
        urls.reduce((p, u) => p.then(() => c.match(u, { ignoreSearch: true }).then((hit) => hit || c.add(new Request(u, { cache: "reload" })).catch(() => {}))), Promise.resolve()),
      ),
    );
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("cet4v-") && k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

let trimming = null;
function trimAudio() {
  if (trimming) return trimming;
  trimming = caches
    .open(AUDIO_CACHE)
    .then((c) =>
      c.keys().then((keys) => {
        // keys() 按写入顺序返回：超出上限时删最早的
        const extra = keys.length - AUDIO_MAX;
        return extra > 0 ? Promise.all(keys.slice(0, extra).map((k) => c.delete(k))) : null;
      }),
    )
    .catch(() => null)
    .then(() => {
      trimming = null;
    });
  return trimming;
}

/** 有道发音：cache-first。<audio> 发的是 no-cors（可能带 Range），这里统一用不带 Range 的整段请求取回并缓存。 */
function audioResponse(req) {
  const key = req.url;
  return caches.open(AUDIO_CACHE).then((c) =>
    c.match(key).then((hit) => {
      if (hit) return hit;
      return fetch(new Request(key, { mode: "no-cors", credentials: "omit" })).then((res) => {
        // 跨域无 CORS 头 → opaque（status 0）；同样可以缓存和播放
        if (res.type === "opaque" || (res.ok && res.status === 200)) {
          const copy = res.clone();
          c.put(key, copy)
            .then(trimAudio)
            .catch(() => {}); // 配额不足：不缓存，照常播放
        }
        return res;
      });
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (AUDIO_RE.test(req.url)) {
    event.respondWith(audioResponse(req));
    return;
  }
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 其它外部资源（例句接口等）不拦截
  // 13.0 · 版本号文件永远走网络（更新提示要看服务器上的最新版本）；同域的 /sb-api（云同步）不缓存
  if (/\/version\.json$/.test(url.pathname) || /\/sb-api\//.test(url.pathname)) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("index.html", { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
