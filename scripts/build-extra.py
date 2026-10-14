#!/usr/bin/env python3
"""13.0 · Extra data for 四级单词打卡 (run after build-data.py; idempotent).

Adds to public/data/cet4.json
  "b": 1   basic word (hidden unless 设置 → 包含基础词). 13.0.0 strict rule, see data-licenses/README.md —
           basic only when one of these holds (rank = wordfreq top_n_list("en") position, 0-based):
             1. PEP (人教版) primary list (grades 3–6) AND rank < 1000 AND ≤ 7 letters
             2. PEP junior-high list (grades 7–9) AND rank < 500 AND ≤ 6 letters
             3. PEP primary list AND rank < 3000 AND ≤ 5 letters AND not a CET-4 core word (qwerty-learner CET4_T)
           (the WIP rule hid 655 incl. government / information / degree; this one hides ~360)
  "z": 47  wordfreq Zipf frequency × 10 (integer; 0 = not in wordfreq)

Writes
  public/data/ex/<letter>.json  {word: [[en, zh, src, at, len], ...]}   1–2 per word
        src "t<engId>-<cmnId>" = Tatoeba (CC-BY 2.0 FR), "a" = authored for this app (scripts/authored-examples.tsv)
        at/len = where the target word (or its inflected form) sits in `en`, for the highlighter
  public/data/syn.json       {word: [synonym, ...]}  WordNet 3.0 (WordNet License) lemmas from the word's first 4 senses
        per part of speech, kept only when the synonym is in the word list AND the two Chinese meanings share a
        2-character chunk (filters WordNet senses CET-4 doesn't teach: lag → jail)

Sources are downloaded into $EXTRA_SRC (default /tmp/cet4-extra) on first run.
Usage: python3 scripts/build-extra.py [--stats]
Needs: pip install wordfreq nltk opencc-python-reimplemented ; WordNet corpus in ~/nltk_data
"""
import bz2
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "public", "data")
SRC = os.environ.get("EXTRA_SRC", "/tmp/cet4-extra")
AUTHORED = os.path.join(HERE, "authored-examples.tsv")
QWERTY = "https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/"
PEP_PRIMARY = [f"PEPXiaoXue{g}_{t}_T" for g in (3, 4, 5, 6) for t in (1, 2)]
PEP_JUNIOR = ["PEPChuZhong7_1_T", "PEPChuZhong7_2_T", "PEPChuZhong8_1_T", "PEPChuZhong8_2_T", "PEPChuZhong9_1_T"]
TATOEBA = "https://downloads.tatoeba.org/exports/per_language/"
MOBY = "https://www.gutenberg.org/files/3202/files/mthesaur.txt"
TAT_FILES = ["eng/eng-cmn_links.tsv", "cmn/cmn_sentences.tsv", "eng/eng_sentences.tsv"]


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print("downloading", url)
        urllib.request.urlretrieve(url, path)
    return path


def tat(name):
    out = os.path.join(SRC, os.path.basename(name))
    if not os.path.exists(out):
        bz = fetch(TATOEBA + name + ".bz2", out + ".bz2")
        with bz2.open(bz) as f, open(out, "wb") as g:
            g.write(f.read())
    return out


def pep_words(names):
    s = set()
    for n in names:
        with open(fetch(QWERTY + n + ".json", os.path.join(SRC, "pep", n + ".json")), encoding="utf-8") as f:
            for e in json.load(f):
                if isinstance(e, dict) and e.get("name"):
                    s.add(str(e["name"]).strip().lower())
    return s


# ---------------------------------------------------------------- basic words + frequency


def is_basic(k, r, core, pri, jun):
    if k in pri and r < 1000 and len(k) <= 7:
        return True
    if k in jun and r < 500 and len(k) <= 6:
        return True
    return k in pri and r < 3000 and len(k) <= 5 and not core


def mark_basic(words):
    import wordfreq

    pri, jun = pep_words(PEP_PRIMARY), pep_words(PEP_JUNIOR)
    rank = {w: i for i, w in enumerate(wordfreq.top_n_list("en", 5000))}
    n = 0
    for w in words:
        w.pop("b", None)
        k = w["w"].lower()
        z = wordfreq.zipf_frequency(w["w"], "en")
        w["z"] = int(round(z * 10))
        r = rank.get(k, 99999)
        if is_basic(k, r, bool(w.get("c")), pri, jun):
            w["b"] = 1
            n += 1
    return n


# ---------------------------------------------------------------- lemmas


_lem = {}


def lemmas(tok):
    from nltk.corpus import wordnet as wn

    hit = _lem.get(tok)
    if hit is None:
        hit = {tok}
        for p in "nvar":
            m = wn.morphy(tok, p)
            if m:
                hit.add(m)
        _lem[tok] = hit
    return hit


TOKEN = re.compile(r"[A-Za-z]+(?:-[A-Za-z]+)*")
NAMES = {"tom", "mary", "john", "ken", "jim", "bob", "mike", "tony", "jack", "lucy", "alice", "sami", "layla", "dan", "linda", "boston", "australia", "fadil", "mennad", "baya", "yanni"}


# ---------------------------------------------------------------- examples


def build_examples(words):
    import wordfreq
    from opencc import OpenCC

    t2s = OpenCC("t2s")
    want = {w["w"].lower(): w["w"] for w in words}
    cmn = {}
    for line in open(tat("cmn/cmn_sentences.tsv"), encoding="utf-8"):
        i, _, t = line.rstrip("\n").split("\t", 2)
        cmn[i] = t
    links = defaultdict(list)
    for line in open(tat("eng/eng-cmn_links.tsv")):
        a, b = line.split()
        links[a].append(b)
    cands = defaultdict(list)  # word -> [(score, en, zh, src, at, len)]
    for line in open(tat("eng/eng_sentences.tsv"), encoding="utf-8"):
        i, _, en = line.rstrip("\n").split("\t", 2)
        if i not in links:
            continue
        en = re.sub(r"\s+", " ", en).strip()
        toks = list(TOKEN.finditer(en))
        n = len(toks)
        if n < 4 or n > 20 or len(en) > 120 or not re.match(r"^[A-Z\"']", en) or not re.search(r"[.?!\"']$", en):
            continue
        zh = None
        for b in links[i]:
            c = cmn.get(b)
            if c and 3 <= len(c) <= 60 and re.search(r"[\u4e00-\u9fff]", c) and not re.search(r"[A-Za-z]{3,}", c):
                zh = (t2s.convert(c), b)
                break
        if not zh:
            continue
        low = [t.group(0).lower() for t in toks]
        names = sum(1 for t in low if t in NAMES)
        rare = sum(1 for t in low if wordfreq.zipf_frequency(t, "en") < 3.0)
        base = abs(n - 10) * 2 + names * 6 + rare * 4
        seen = set()
        for t in toks:
            tl = t.group(0).lower()
            for lem in lemmas(tl):
                if lem in want and lem not in seen:
                    seen.add(lem)
                    exact = 0 if tl == lem else 3
                    cands[lem].append((base + exact + rare * 0, en, zh[0], f"t{i}-{zh[1]}", t.start(), len(t.group(0))))
    out = {}
    for k, w in want.items():
        lst = sorted(cands.get(k, []), key=lambda x: (x[0], len(x[1]), x[1]))
        pick, used = [], set()
        for c in lst:
            key = c[1].lower()
            if key in used or c[2] in used:
                continue
            used.update((key, c[2]))
            pick.append([c[1], c[2], c[3], c[4], c[5]])
            if len(pick) == 2:
                break
        if pick:
            out[w] = pick
    return out


def locate(en, word):
    """Where the word or a regular inflection sits in an authored sentence."""
    w = re.escape(word)
    m = re.search(rf"(?<![A-Za-z])({w}(?:s|es|d|ed|ing|ly|er|est)?|{w}{re.escape(word[-1])}(?:ed|ing|er)|{w[:-1]}(?:ies|ied|ying|ing|ed)?)(?![A-Za-z])", en, re.I)
    return (m.start(1), len(m.group(1))) if m else (-1, 0)


def add_authored(out, words):
    if not os.path.exists(AUTHORED):
        return 0
    n = 0
    have = {w["w"] for w in words}
    for line in open(AUTHORED, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line or line.startswith("#"):
            continue
        w, en, zh = line.split("\t")
        if w not in have or w in out:
            continue
        at, ln = locate(en, w)
        if at < 0:
            print("authored: target not found", w, "|", en)
            continue
        out[w] = [[en, zh, "a", at, ln]]
        n += 1
    return n


# ---------------------------------------------------------------- synonyms (WordNet)

WN_POS = {"n": ["n"], "v": ["v"], "adj": ["a", "s"], "adv": ["r"]}


def pos_set(word):
    out = set()
    for pos, _ in word["t"]:
        for p in re.findall(r"[a-z]+", pos.lower()):
            p = {"vt": "v", "vi": "v", "a": "adj", "ad": "adv"}.get(p, p)
            if p in WN_POS:
                out.add(p)
    return out


def inflect_pair(a, b):
    s, l = (a, b) if len(a) <= len(b) else (b, a)
    return l.startswith(s) and l[len(s):] in ("s", "es", "d", "ed", "ly", "r", "er", "y", "ing")


def cn_bigrams(word):
    """Chinese meaning → set of 2-char chunks (brackets, pos tags, 的/地/得 and punctuation removed)."""
    out = set()
    for _, m in word["t"]:
        m = re.sub(r"（[^）]*）|\([^)]*\)|\[[^\]]*\]", "", m)
        for part in re.split(r"[；;，,、…\s]+", m):
            part = re.sub(r"[^\u4e00-\u9fff]", "", part).replace("的", "").replace("地", "")
            if len(part) == 1:
                out.add(part * 2)  # a one-character sense only matches the same one-character sense
            for i in range(len(part) - 1):
                out.add(part[i : i + 2])
    return out


def build_syn(words):
    import wordfreq
    from nltk.corpus import wordnet as wn

    book = {w["w"].lower(): w for w in words if not w.get("b")}
    allw = {w["w"].lower(): w for w in words}
    out = {}
    bi = {k: cn_bigrams(w) for k, w in allw.items()}
    moby = {}
    mpath = fetch(MOBY, os.path.join(SRC, "mthesaur.txt"))
    for line in open(mpath, encoding="latin-1"):
        parts = line.rstrip("\r\n").split(",")
        h = parts[0].lower()
        if h in allw:
            moby[h] = [x.lower() for x in parts[1:] if x.lower() in allw]
    for k, w in allw.items():
        if not re.fullmatch(r"[a-z]+(?:-[a-z]+)?", k):
            continue
        ps = pos_set(w) or {"n", "v", "adj", "adv"}
        score_in, score_out = {}, {}
        for p in ps:
            syns = [s for s in wn.synsets(k) if s.pos() in WN_POS[p]][:4]
            for rank_, s in enumerate(syns):
                group = list(s.lemmas())
                if p == "adj":
                    for sim in s.similar_tos()[:3]:
                        group += sim.lemmas()
                for lem in group:
                    c = lem.name().lower()
                    if c == k or "_" in c or inflect_pair(c, k) or c[:4] == k[:4] and abs(len(c) - len(k)) <= 3:
                        continue
                    sc = rank_ * 10 + (0 if lem.synset() is s else 5)
                    if c in allw and not (bi[k] & bi[c]):
                        continue  # WordNet sense the Chinese meanings don't share (lag → jail): not a synonym here
                    if c in book:
                        score_in[c] = min(score_in.get(c, 99), sc - (2 if book[c].get("c") else 0))
                    elif c in allw:
                        score_in[c] = min(score_in.get(c, 99), sc + 3)  # basic words still link (they open the detail page)
                    # out-of-book lemmas can't be checked against a Chinese meaning: not shown
        # Moby Thesaurus II (public domain): only fills in after WordNet, same in-book + Chinese-meaning check;
        # ranked by how much of the Chinese meaning the two share
        for c in moby.get(k, ()):
            if c == k or c in score_in or c not in allw or inflect_pair(c, k):
                continue
            ov = len(bi[k] & bi[c])
            if ov:
                score_in[c] = 100 - min(ov, 9) * 5 - (2 if allw[c].get("c") else 0) + (3 if allw[c].get("b") else 0)
        ins = [allw[c]["w"] for c, _ in sorted(score_in.items(), key=lambda x: (x[1], x[0]))][:5]
        if ins:
            out[w["w"]] = ins
    return out


def shard_of(word):
    c = word[:1].lower()
    return c if "a" <= c <= "z" else "_"


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    if "--quiet" not in sys.argv or not path.endswith(".json") or "/ex/" not in path:
        print("wrote", path, os.path.getsize(path), "bytes")


def main():
    path = os.path.join(DATA, "cet4.json")
    words = json.load(open(path, encoding="utf-8"))
    total = len(words)
    nb = mark_basic(words)
    dump(path, words)
    active = [w for w in words if not w.get("b")]
    print(f"words {total} → active {len(active)} (basic hidden {nb})")
    if "--sample" in sys.argv or "--basic-only" in sys.argv:
        import random

        hidden = [w["w"] for w in words if w.get("b")]
        print("sample of 40 hidden:", sorted(random.Random(13).sample(hidden, min(40, len(hidden)))))
    if "--basic-only" in sys.argv:  # only re-mark b / z; examples and synonyms already cover every word
        return

    ex = build_examples(words)
    tat_active = sum(1 for w in active if w["w"] in ex)
    na = add_authored(ex, words)
    # sharded by first letter so a card back only fetches ~1/26 of the sentences
    exdir = os.path.join(DATA, "ex")
    os.makedirs(exdir, exist_ok=True)
    for f in os.listdir(exdir):
        os.remove(os.path.join(exdir, f))
    shards = defaultdict(dict)
    for k, v in ex.items():
        shards[shard_of(k)][k] = v
    for sh, obj in sorted(shards.items()):
        dump(os.path.join(exdir, sh + ".json"), obj)
    cov = sum(1 for w in active if w["w"] in ex)
    print(f"examples: tatoeba {tat_active}/{len(active)}, authored {na}, active coverage {cov}/{len(active)} = {cov / len(active):.1%}; all {sum(1 for w in words if w['w'] in ex)}/{total}")
    missing = [w["w"] for w in active if w["w"] not in ex]
    with open(os.path.join(SRC, "missing-examples.txt"), "w") as f:
        f.write("\n".join(missing))
    print("missing active:", len(missing), missing[:20])

    syn = build_syn(words)
    dump(os.path.join(DATA, "syn.json"), syn)
    si = sum(1 for w in active if w["w"] in syn)
    print(f"synonyms (WordNet + Moby, Chinese-meaning checked): {si}/{len(active)} = {si / len(active):.1%}")


if __name__ == "__main__":
    main()
