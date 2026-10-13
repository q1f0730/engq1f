/**
 * 11.2 · 代码块没下载下来（离线 / 发了新版旧文件被删 / 第一次打开还没缓存完）——这和「记录坏了」是两回事：
 * 只给「重试」，不提记录、不出回滚按钮。
 */
export function isChunkError(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e ?? "");
  const n = String((e as Error)?.name ?? "");
  return (
    n === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed|Unable to preload CSS|Failed to fetch|NetworkError|Load failed/i.test(m)
  );
}

