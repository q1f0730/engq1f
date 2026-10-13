import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { getWordsSync, shortMeaning, type Word } from "@/lib/data";
import { POS_CN, familyOf, synonymsOf } from "@/lib/groups";

/** v9 · 单词详情里的同义词组与同根形词（懒加载，不占首屏） */
export default function WordExtra({ word, onOpen }: { word: Word; onOpen: (w: Word) => void }) {
  const index = getWordsSync();
  if (!index) return null;
  const syn = synonymsOf(index, word);
  const fam = familyOf(index, word);
  if (!syn.length && !fam.length) return null;
  const open = (w: string) => {
    const x = index.map.get(w);
    if (x) onOpen(x);
  };
  return (
    <div className="space-y-5">
      {syn.length > 0 && (
        <div data-testid="synonyms">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-bold tracking-wider text-muted-foreground">同义词 · 意思相同</span>
            <Link to="/syn" search={{ q: syn[0].sense }} data-testid="syn-all" className="flex items-center text-[12px] font-semibold text-primary">
              全部同义词组 <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <ul className="space-y-2">
            {syn.map((g) => (
              <li key={g.key} className="rounded-xl bg-secondary/70 px-3 py-2" data-testid="syn-group" data-sense={g.sense}>
                <div className="text-[13px] font-semibold text-foreground/80">
                  {POS_CN[g.pos] && <span className="mr-1.5 rounded-md bg-background/70 px-1.5 py-px text-[11px] italic text-muted-foreground">{POS_CN[g.pos]}</span>}
                  {g.sense}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {g.words
                    .filter((w) => w !== word.w)
                    .map((w) => (
                      <button
                        key={w}
                        type="button"
                        data-testid="syn-word"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(w);
                        }}
                        className="font-display rounded-full bg-card px-2.5 py-1 text-[14px] font-bold shadow-sm ring-1 ring-border/70 transition hover:ring-primary/50 active:scale-95"
                      >
                        {w}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {fam.length > 0 && (
        <div data-testid="family">
          <div className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">同根形词 · 共享前缀</div>
          <div className="grid grid-cols-2 gap-1.5">
            {fam.map(({ w, prefix }) => {
              const x = index.map.get(w);
              return (
                <button
                  key={w}
                  type="button"
                  data-testid="family-word"
                  data-prefix={prefix}
                  onClick={(e) => {
                    e.stopPropagation();
                    open(w);
                  }}
                  className="min-w-0 rounded-xl bg-secondary/70 px-3 py-2 text-left transition hover:bg-secondary active:scale-[0.98]"
                >
                  <span className="font-display block truncate text-[15px] font-bold">
                    <span className="text-muted-foreground">{w.slice(0, prefix)}</span>
                    <span className="text-primary">{w.slice(prefix)}</span>
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">{x ? shortMeaning(x, 1) : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
