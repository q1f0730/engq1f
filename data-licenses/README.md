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

## 13.0 新增数据

由 `scripts/build-extra.py` 生成（在 `build-data.py` 之后运行，可重复运行）。

| 文件 / 字段 | 来源 | 许可 |
|---|---|---|
| `cet4.json` 的 `b`（基础词，默认隐藏） | 人教版（PEP）小学 3–6 年级、初中 7–9 年级英语词表，取自 qwerty-learner `public/dicts/PEPXiaoXue*_T.json`、`PEPChuZhong*_T.json`；词频排名取自 wordfreq `top_n_list("en")` | GPL-3.0（qwerty-learner，同上）；wordfreq 数据 CC-BY-SA 4.0（Robyn Speer，https://github.com/rspeer/wordfreq） |
| `cet4.json` 的 `z`（词频 Zipf × 10，用于难度分） | wordfreq 3.x `zipf_frequency(word, "en")` | CC-BY-SA 4.0，© Robyn Speer 及 wordfreq 引用的语料作者；`z` 这一列按 CC-BY-SA 4.0 分发（与 GPL-3.0 单向兼容） |
| `data/ex/*.json` 例句（`src` 以 `t` 开头） | Tatoeba 英–中句对 https://tatoeba.org ，`src = t<英文句 id>-<中文句 id>`，可在 `https://tatoeba.org/sentences/show/<id>` 查看原句和作者；繁体译文用 OpenCC 转成简体 | CC-BY 2.0 FR（https://creativecommons.org/licenses/by/2.0/fr/），署名：Tatoeba 及各句作者 |
| `data/ex/*.json` 例句（`src = "a"`） | 本应用自写（`scripts/authored-examples.tsv`，共 552 句，界面上标「自编」） | GPL-3.0，随本仓库 |
| `data/syn.json` 同义词 | WordNet 3.0（Princeton University）；Moby Thesaurus II（Grady Ward，公有领域，Project Gutenberg #3202）。只保留**词库里有、且两边中文释义有相同两字片段**的词 | WordNet License（[WordNet-3.0-License.txt](WordNet-3.0-License.txt)）；Moby：Public Domain |

### 基础词规则（`b`，13.0.0 收紧）
一个词被标成基础词（默认不出现在学习、词库、统计里），当且仅当满足下面任意一条（词频排名 = wordfreq `top_n_list("en")` 里的位置，从 0 数）：
1. 在人教版小学 3–6 年级词表里，**并且**词频前 1000，**并且**不超过 7 个字母；
2. 在人教版初中 7–9 年级词表里，**并且**词频前 500，**并且**不超过 6 个字母；
3. 在人教版小学词表里，**并且**词频前 3000，**并且**不超过 5 个字母，**并且**不是四级核心词（qwerty-learner CET4_T）。

结果：4544 个词 → 4182 个（362 个基础词隐藏，「我的 → 包含基础词」可以打开）。government、information、degree、attention、national、traffic 这类中等词都留在词库里（13.0 开发版的旧规则「小学词表 或 初中词表 + 前 1000」隐藏了 655 个，误伤了它们）。已经学过的基础词照常复习，不丢记录。

### 字体
| 文件 | 来源 | 许可 |
|---|---|---|
| `public/fonts/noto-serif-sc-heading-600.woff2` | Noto Serif SC（Google / Adobe），只切了界面标题用到的约 280 个字，600 字重（`scripts/subset-song.py`） | SIL OFL 1.1（[NotoSerifSC-OFL-1.1.txt](NotoSerifSC-OFL-1.1.txt)） |
