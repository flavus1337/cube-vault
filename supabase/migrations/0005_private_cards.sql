-- Cards a player owns outside the cube. Only the owner sees them, and they
-- never show up in the cube, its history or another player's view.

create table private_cards (
  owner uuid not null default auth.uid() references profiles on delete cascade,
  print_id text not null, -- Scryfall id of the scanned print
  oracle_id text not null,
  set_code text not null,
  set_name text,
  number text not null,
  name text not null,
  name_de text,
  type_line text not null default '',
  type_de text,
  mana_cost text not null default '',
  cmc real not null default 0,
  colors text not null default '',
  rarity text,
  image text,
  price_eur real,
  lang text not null default 'en',
  qty int not null check (qty > 0),
  added_at timestamptz not null default now(),
  primary key (owner, print_id)
);

alter table private_cards enable row level security;
create policy "own cards only" on private_cards for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Adds one copy of a scanned print and returns how many copies the owner has.
create function add_private_copy(card jsonb) returns int
language sql set search_path = public as $$
  insert into private_cards
  select (jsonb_populate_record(
    null::private_cards,
    -- defaults first, the scanned card second, our own columns last
    jsonb_build_object('type_line', '', 'mana_cost', '', 'colors', '', 'cmc', 0, 'lang', 'en')
    || card
    || jsonb_build_object('owner', auth.uid(), 'qty', 1, 'added_at', now())
  )).*
  on conflict (owner, print_id) do update set qty = private_cards.qty + 1
  returning qty;
$$;

create function remove_private_copy(p_print_id text) returns int
language sql set search_path = public as $$
  delete from private_cards where owner = auth.uid() and print_id = p_print_id and qty <= 1;
  update private_cards set qty = qty - 1 where owner = auth.uid() and print_id = p_print_id;
  select coalesce((select qty from private_cards where owner = auth.uid() and print_id = p_print_id), 0);
$$;
