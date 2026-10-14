/**
 * 13.0.0 · Cloudflare 后端的服务端裁决规则（和 Meoo Cloud 的 vocab_push_cards 同一个意思）：
 *  - 同一个词，ts（最后作答 / 删除时刻，毫秒）更晚的赢；
 *  - ts 相同：墓碑（card = null）赢；两边都是卡片 / 都是墓碑 → 留服务端已有的（重复推送不改任何东西）。
 * 真正写库时由 PUSH_SQL 的 ON CONFLICT … WHERE 在数据库里原子地执行同一条规则；这里的纯函数给单元测试和「同一批里同一个词出现两次」用。
 */
export interface Row {
  word: string;
  /** JSON 字符串；null = 墓碑 */
  card: string | null;
  ts: number;
}

/** incoming 能不能覆盖 existing */
export function wins(existing: Pick<Row, "card" | "ts"> | null | undefined, incoming: Pick<Row, "card" | "ts">): boolean {
  if (!existing) return true;
  if (incoming.ts !== existing.ts) return incoming.ts > existing.ts;
  return incoming.card === null && existing.card !== null;
}

/** 同一批里同一个词出现多次：按同样的规则先在内存里挑出赢家 */
export function dedupe(rows: Row[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of rows) if (wins(m.get(r.word), r)) m.set(r.word, r);
  return [...m.values()];
}

/** 服务端裁决的 upsert（?1 user_id 来自验证过的会话，不来自请求体） */
export const PUSH_SQL = `INSERT INTO cards (user_id, word, card, ts, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT (user_id, word) DO UPDATE SET card = excluded.card, ts = excluded.ts, updated_at = excluded.updated_at
WHERE excluded.ts > cards.ts OR (excluded.ts = cards.ts AND excluded.card IS NULL AND cards.card IS NOT NULL)`;
