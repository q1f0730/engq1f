# 四级单词打卡

免费、无广告、不用注册、离线可用的 CET-4 背单词 PWA（墨墨/不背单词/百词斩式）。作者 Q1f730。

## 开发
```
pnpm install
pnpm dev          # http://localhost:3015
pnpm test         # vitest：src/lib/srs.test.ts（记忆算法）
pnpm typecheck
pnpm build        # dist/（含 sw.js、data/cet4.json）
```

## 数据
`python3 scripts/build-data.py` 生成 `public/data/cet4.json`（运行时 fetch，不打进 JS）。
- 词表/释义/短语：KyleBing/english-vocabulary `3-CET4-顺序.json`（BSD-3）。源文件 7508 条，同一单词出现 2–3 次，合并后 4544 个词。
- 音标：合并 `../qwerty/public/dicts/*.json` 的 usphone/ukphone（qwerty-learner，GPL-3.0 数据）。
- `c:1` 核心词 = 在 CET4_T.json 中（2607）；`o:1` = Oxford 3000（词汇量测试的基础层）。

## 结构
- `src/lib/srs.ts` 纯函数记忆算法 + 组内重学队列 + 撤销 + 打卡/连续天数
- `src/lib/store.ts` localStorage 状态、导入导出
- `src/lib/plan.ts` 词书顺序、每日任务、复习组、干扰项
- `src/routes/` 今日 / study / words / stats / me / welcome / test（TanStack 文件路由，hash history，自动分包）
- `src/sw-template.js` → 构建时生成 `dist/sw.js`（预缓存 app shell + 词库）

调试：`?debugDays=N` 把时钟向后拨 N 天。
