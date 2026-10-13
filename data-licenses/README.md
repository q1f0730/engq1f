# 数据许可（data licenses）

`public/data/cet4.json` 由 `scripts/build-data.py` 从下面两个来源合并生成，随应用一起分发：

| 字段 | 来源 | 许可 | 许可全文 |
|---|---|---|---|
| `w` 单词、`t` 释义、`ph` 短语 | KyleBing/english-vocabulary — `json/3-CET4-顺序.json`<br>https://github.com/KyleBing/english-vocabulary | BSD-3-Clause，Copyright (c) 2022-2026, KyleBing | [KyleBing-english-vocabulary-BSD-3-Clause.txt](KyleBing-english-vocabulary-BSD-3-Clause.txt) |
| `p` 美音 / 英音音标、`c` 核心词标记（CET4_T） | qwerty-learner 词典数据 `public/dicts/*.json`<br>https://github.com/RealKai42/qwerty-learner | GPL-3.0 | [qwerty-learner-GPL-3.0.txt](qwerty-learner-GPL-3.0.txt) |

`o`（Oxford 3000 基础词标记，用于词汇量测试分层）同样来自 qwerty-learner 的词典数据。

**`public/data/cet4.json` 含 GPL-3.0 数据**，所以整个仓库按 GPL-3.0 发布（见仓库根目录 `LICENSE`）。BSD-3-Clause 与 GPL-3.0 兼容；按 BSD-3-Clause 第 1、2 条，上面保留了 KyleBing 的版权声明与许可全文。

运行时在线获取、未随仓库分发的数据：

- 英文例句：Free Dictionary API（https://dictionaryapi.dev/），联网时按需请求，只缓存在用户浏览器里。
- 单词发音：有道词典 dictvoice 接口，联网时播放并由 service worker 缓存在用户浏览器里；离线时改用系统语音（Web Speech API）。
