#!/usr/bin/env python3
"""13.0 · 中文标题宋体：从 Noto Serif SC（OFL）切出界面标题用到的汉字，600 字重，输出 public/fonts/noto-serif-sc-heading-600.woff2。

标题字 = 源码里 PageHeader / Sec / PanelTitle 的 title、带 song 样式的元素里的文字、问候语、难度档位名。
没切进去的字（例如用户起的词单名）落到系统宋体。
Usage: python3 scripts/subset-song.py [/path/NotoSerifSC[wght].ttf]
Needs: pip install fonttools brotli
Font: https://github.com/google/fonts/raw/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf
"""
import glob
import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/NotoSerifSC.ttf"
OUT = os.path.join(ROOT, "public", "fonts", "noto-serif-sc-heading-600.woff2")
CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")

text = set("0123456789·：，、？！（）「」《》—…")
files = glob.glob(os.path.join(ROOT, "src", "**", "*.tsx"), recursive=True) + [os.path.join(ROOT, "src", "lib", "level.ts")]
for f in files:
    s = open(f, encoding="utf-8").read()
    chunks = []
    chunks += re.findall(r'\btitle=\{?["`]([^"`]+)["`]', s)
    chunks += re.findall(r"<PanelTitle[^>]*>([^<{]+)", s)
    chunks += re.findall(r'className="[^"]*\bsong\b[^"]*"[^>]*>([^<]+)', s)
    if f.endswith("level.ts"):
        chunks += re.findall(r'"([^"]+)"', s)
    if f.endswith(os.path.join("routes", "index.tsx")):
        m = re.search(r"function greeting\(\)[\s\S]{0,600}?\n\}", s)
        if m:
            chunks.append(m.group(0))
    for c in chunks:
        text.update(CJK.findall(c))

font = TTFont(SRC)
font = instancer.instantiateVariableFont(font, {"wght": 600})
opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
sub = subset.Subsetter(opts)
sub.populate(text="".join(sorted(text)))
sub.subset(font)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
font.flavor = "woff2"
font.save(OUT)
print(f"{len(text)} chars → {OUT} ({os.path.getsize(OUT)} bytes)")
