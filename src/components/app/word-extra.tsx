import { Link } from "@tanstack/react-router";
import { ChevronRight } from "@/components/app/icons";
import { getWordsSync, shortMeaning, type Word } from "@/lib/data";
import { POS_CN, familyOf, synonymsOf } from "@/lib/groups";

/** v9 · 单词详情里的同义词组与拼写相近的词（懒加载，不占首屏） */
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
            <span className="text-xs font-semibold text-ink-3">同义词 · 意思相同</span>
            <Link to="/syn" search={{ q: syn[0].sense }} data-testid="syn-all" className="flex items-center text-xs font-semibold text-ink">
              全部同义词组 <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <ul className="space-y-2">
            {syn.map((g) => (
              <li key={g.key} className="rounded-xl bg-paper-2 px-3 py-2" data-testid="syn-group" data-sense={g.sense}>
                <div className="text-[0.8125rem] font-semibold text-ink">
                  {POS_CN[g.pos] && <span className="mr-1.5 rounded-md bg-paper px-1.5 py-px text-[0.6875rem] italic text-ink-3">{POS_CN[g.pos]}</span>}
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
                        className="press font-display rounded-lg bg-paper-3 px-2.5 py-1 text-sm font-semibold ring-1 ring-rule hover:ring-ink"
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
          <div className="mb-2 text-xs font-semibold text-ink-3">拼写相近 · 多为同根派生</div>
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
                  className="press min-w-0 rounded-xl bg-paper-2 px-3 py-2 text-left hover:bg-paper-2"
                >
                  <span className="font-display block truncate text-[0.9375rem] font-semibold">
                    <span className="text-ink-3">{w.slice(0, prefix)}</span>
                    <span className="text-ink">{w.slice(prefix)}</span>
                  </span>
                  <span className="block truncate text-xs text-ink-3">{x ? shortMeaning(x, 1) : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
