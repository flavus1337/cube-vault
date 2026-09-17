-- Run once in the Supabase SQL editor.

create table cards (
  id text primary key, -- Scryfall id of the print
  name text not null,
  printed_name text,
  lang text,
  set_code text,
  set_name text,
  number text,
  rarity text,
  colors text,
  mana_cost text,
  cmc real,
  type_line text,
  type_de text,
  price_eur real,
  image text,
  qty int not null default 1,
  added_at timestamptz not null default now()
);

-- Everyone may read (website). Only the logged-in scanner account may write.
alter table cards enable row level security;
create policy "public read" on cards for select using (true);
create policy "scanner writes" on cards for all to authenticated using (true) with check (true);

-- Adds one copy and returns the new count. A function keeps "qty + 1" atomic
-- when two phones scan at the same time. Runs with the caller's rights, so RLS applies.
create function add_card(card jsonb) returns int
language sql set search_path = public as $$
  insert into cards
  select (jsonb_populate_record(null::cards, card || jsonb_build_object('qty', 1, 'added_at', now()))).*
  on conflict (id) do update set qty = cards.qty + 1
  returning qty;
$$;

create function change_qty(card_id text, delta int) returns void
language sql set search_path = public as $$
  update cards set qty = qty + delta where id = card_id;
  delete from cards where id = card_id and qty <= 0;
$$;
