-- 13.0 · 账号与云同步（Meoo Cloud / Supabase）
-- 每个用户：一行 profile（乱序种子 + 合并用的其余记录），每个学过的词一行 card。
-- RLS：只能读写 user_id = auth.uid() 的行。
-- 冲突规则：同一个词以「最后一次作答时间」ts（毫秒）更晚的为准，由 vocab_push_cards 在服务端保证（旧设备晚到的写入不会覆盖新的）。

create table if not exists public.vocab_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seed bigint not null,
  -- 除 cards / settings 以外要跨设备合并的记录（打卡日、生词本、词单、复习日志尾部…），客户端用 mergeStates 合并
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.vocab_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null check (char_length(word) between 1 and 64),
  card jsonb not null,
  ts bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, word)
);

create index if not exists vocab_cards_user_updated on public.vocab_cards (user_id, updated_at);

alter table public.vocab_profile enable row level security;
alter table public.vocab_cards enable row level security;

drop policy if exists "vocab_profile own rows" on public.vocab_profile;
create policy "vocab_profile own rows" on public.vocab_profile
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "vocab_cards own rows" on public.vocab_cards;
create policy "vocab_cards own rows" on public.vocab_cards
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 批量写卡片：只在新 ts ≥ 旧 ts 时覆盖（每个词「最后作答时间更晚的赢」）。security invoker = 照样受 RLS 约束。
create or replace function public.vocab_push_cards(rows jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with src as (
    select auth.uid() as user_id, r->>'word' as word, r->'card' as card, (r->>'ts')::bigint as ts
    from jsonb_array_elements(rows) as r
  ), up as (
    insert into public.vocab_cards as c (user_id, word, card, ts, updated_at)
    select user_id, word, card, ts, now() from src where user_id is not null
    on conflict (user_id, word) do update
      set card = excluded.card, ts = excluded.ts, updated_at = now()
      where c.ts <= excluded.ts
    returning 1
  )
  select count(*)::integer from up;
$$;

grant execute on function public.vocab_push_cards(jsonb) to authenticated;
