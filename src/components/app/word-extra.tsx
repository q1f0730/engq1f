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
    <div className="space-y-6">
      {syn.length > 0 && (
        <div data-testid="synonyms">
          <div className="section-rule mb-2 flex items-center justify-between gap-3 text-[0.8125rem] text-ink-3">
            <span>同义词 · 意思相同</span>
            <Link to="/syn" search={{ q: syn[0].sense }} data-testid="syn-all" className="press flex h-9 shrink-0 items-center text-[0.75rem] font-medium text-ink underline decoration-rule-strong underline-offset-4">
              全部同义词组 <ChevronRight className="size-3.5" />
            </Link>
          </div>
          {/* 同义词词典的条目：义项一行，同组的词用逗号串起来 */}
          <ul>
            {syn.map((g) => (
              <li key={g.key} className="border-b border-rule py-2.5 last:border-b-0" data-testid="syn-group" data-sense={g.sense}>
                <div className="text-[0.8125rem] font-semibold text-ink">
                  {POS_CN[g.pos] && <i className="pos mr-1.5 text-[0.9375rem] text-ink-3">{POS_CN[g.pos]}</i>}
                  {g.sense}
                </div>
                <p className="mt-1 leading-[1.8]">
                  {g.words
                    .filter((w) => w !== word.w)
                    .map((w, k, arr) => (
                      <span key={w} className="whitespace-nowrap">
                        <button
                          type="button"
                          data-testid="syn-word"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(w);
                          }}
                          className="press rounded-[2px] font-serif text-[1.125rem] leading-none underline-offset-4 hover:underline"
                        >
                          {w}
                        </button>
                        {k < arr.length - 1 && <span className="font-serif text-ink-3">,</span>}{" "}
                      </span>
                    ))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {fam.length > 0 && (
        <div data-testid="family">
          <div className="section-rule mb-2 text-[0.8125rem] text-ink-3">拼写相近 · 多为同根派生</div>
          <div className="grid grid-cols-2 gap-x-4">
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
                  className="press min-w-0 border-b border-rule py-2 text-left hover:bg-paper-2/60"
                >
                  <span className="block truncate font-serif text-[1.1875rem] leading-tight">
                    <span className="text-ink-3">{w.slice(0, prefix)}</span>
                    <span className="hl text-ink">{w.slice(prefix)}</span>
                  </span>
                  <span className="block truncate text-[0.75rem] text-ink-3">{x ? shortMeaning(x, 1) : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
