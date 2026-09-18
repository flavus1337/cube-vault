-- Decks a player builds from their own cards. Private, like the cards.

create table decks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references profiles on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table deck_cards (
  deck_id uuid not null references decks on delete cascade,
  print_id text not null, -- a print in the owner's private_cards
  qty int not null default 1 check (qty > 0),
  primary key (deck_id, print_id)
);

alter table decks enable row level security;
alter table deck_cards enable row level security;

create policy "own decks" on decks for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy "cards of own decks" on deck_cards for all to authenticated
  using (exists (select 1 from decks d where d.id = deck_id and d.owner = auth.uid()))
  with check (exists (select 1 from decks d where d.id = deck_id and d.owner = auth.uid()));
