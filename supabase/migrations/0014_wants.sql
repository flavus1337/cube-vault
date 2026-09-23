-- Cards the group wants to buy. Everyone who plays may put one on the list
-- and take it off again; a scanned copy takes it off by itself.

create table wants (
  card_id text primary key references cards on delete cascade,
  added_by uuid default auth.uid() references profiles on delete set null,
  added_at timestamptz not null default now(),
  note text
);
create index wants_added_at on wants (added_at desc);

alter table wants enable row level security;
create policy "members read" on wants for select to authenticated
  using (my_role() in ('player', 'editor', 'admin'));
create policy "members write" on wants for all to authenticated
  using (my_role() in ('player', 'editor', 'admin'))
  with check (my_role() in ('player', 'editor', 'admin'));

-- The card is there: off the list, whoever scanned it.
create function drop_want() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from wants where card_id = new.card_id;
  return null;
end $$;

create trigger want_bought after insert or update of qty on copies
  for each row when (new.qty > 0) execute function drop_want();
