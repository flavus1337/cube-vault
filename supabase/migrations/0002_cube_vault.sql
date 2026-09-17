-- Cube Vault foundations: players, sets, cards, scanned copies and history.
-- Replaces the prototype table `cards`. It only held test scans.

drop function if exists add_card(jsonb);
drop function if exists change_qty(text, int);
drop table if exists cards;

-- Players ---------------------------------------------------------------------

create type player_role as enum ('waiting', 'player', 'editor', 'admin');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  avatar_url text,
  discord_id text,
  role player_role not null default 'waiting',
  created_at timestamptz not null default now()
);

-- Every first login creates a profile from the Discord data. The very first
-- profile becomes admin, everyone after that waits for approval.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, avatar_url, discord_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email, 'Unbekannt'),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'provider_id',
    (case when exists (select 1 from profiles) then 'waiting' else 'admin' end)::player_role
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Security definer, so policies can check the role without running into
-- the RLS of `profiles` itself.
create function my_role() returns player_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Cube --------------------------------------------------------------------------

create table sets (
  code text primary key, -- Scryfall set code, e.g. 'blb'
  name text not null,
  released_at date,
  icon_svg_uri text,
  in_cube boolean not null default true,
  added_by uuid default auth.uid() references profiles on delete set null,
  added_at timestamptz not null default now()
);

-- One row per unique card of a set. Variants (borderless, showcase) and
-- other languages are the same card; they only show up in `copies`.
create table cards (
  id text primary key, -- Scryfall id of the main print (lowest collector number)
  oracle_id text not null,
  set_code text not null references sets on delete cascade,
  number text not null,
  name text not null,
  name_de text,
  type_line text not null default '',
  type_de text,
  oracle_text text not null default '',
  text_de text,
  mana_cost text not null default '',
  cmc real not null default 0,
  colors text not null default '', -- e.g. 'WU'
  color_identity text not null default '',
  keywords text[] not null default '{}',
  rarity text not null,
  layout text,
  image text, -- German print when Scryfall has one
  image_en text,
  price_eur real,
  excluded boolean not null default false,
  exclude_reason text,
  unique (set_code, oracle_id)
);

create table copies (
  print_id text primary key, -- Scryfall id of the scanned print (variant + language)
  card_id text not null references cards on delete cascade,
  lang text not null default 'en',
  qty int not null check (qty > 0)
);
create index copies_card_id on copies (card_id);

-- History -----------------------------------------------------------------------

create table card_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid() references profiles on delete set null,
  action text not null,
  set_code text,
  card_id text,
  player_id uuid, -- for role changes
  delta int,
  note text
);
create index card_events_at on card_events (at desc);

-- Triggers write the history, so no change can skip it.
create function log_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d int;
begin
  if tg_table_name = 'sets' then
    if tg_op = 'INSERT' then
      insert into card_events (action, set_code) values ('set_added', new.code);
    elsif tg_op = 'DELETE' then
      insert into card_events (action, set_code) values ('set_deleted', old.code);
    else
      insert into card_events (action, set_code)
      values (case when new.in_cube then 'set_included' else 'set_removed' end, new.code);
    end if;

  elsif tg_table_name = 'cards' then
    insert into card_events (action, set_code, card_id, note)
    values (case when new.excluded then 'card_excluded' else 'card_included' end,
            new.set_code, new.id, new.exclude_reason);

  elsif tg_table_name = 'copies' then
    if tg_op = 'INSERT' then
      d := new.qty;
    elsif tg_op = 'UPDATE' then
      d := new.qty - old.qty;
    else
      d := -old.qty;
    end if;
    if d <> 0 then
      insert into card_events (action, set_code, card_id, delta)
      select case when d > 0 then 'copy_added' else 'copy_removed' end, c.set_code, c.id, d
      from (select coalesce(new.card_id, old.card_id) as id) x
      left join cards c using (id);
    end if;

  elsif tg_table_name = 'profiles' then
    insert into card_events (action, player_id, note)
    values ('player_role', new.id, old.role || ' → ' || new.role);
  end if;
  return null;
end $$;

create trigger log_sets after insert or delete or update of in_cube on sets
  for each row execute function log_event();
create trigger log_cards after update of excluded on cards
  for each row when (old.excluded is distinct from new.excluded) execute function log_event();
create trigger log_copies after insert or update of qty or delete on copies
  for each row execute function log_event();
create trigger log_roles after update of role on profiles
  for each row when (old.role is distinct from new.role) execute function log_event();

-- Scanning ----------------------------------------------------------------------

-- Adds one scanned copy and returns how many copies of the card exist now.
create function add_copy(p_print_id text, p_card_id text, p_lang text) returns int
language sql set search_path = public as $$
  insert into copies (print_id, card_id, lang, qty) values (p_print_id, p_card_id, p_lang, 1)
  on conflict (print_id) do update set qty = copies.qty + 1;
  select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id;
$$;

create function remove_copy(p_print_id text, p_card_id text) returns int
language sql set search_path = public as $$
  delete from copies where print_id = p_print_id and qty <= 1;
  update copies set qty = qty - 1 where print_id = p_print_id;
  select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id;
$$;

-- Access rules ------------------------------------------------------------------
-- Nothing is readable without an approved login. Waiting players only see
-- their own profile. Editors change the cube, admins manage players.

alter table profiles enable row level security;
alter table sets enable row level security;
alter table cards enable row level security;
alter table copies enable row level security;
alter table card_events enable row level security;

create policy "own profile or members" on profiles for select to authenticated
  using (id = auth.uid() or my_role() in ('player', 'editor', 'admin'));
create policy "admins manage players" on profiles for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

create policy "members read" on sets for select to authenticated
  using (my_role() in ('player', 'editor', 'admin'));
create policy "editors write" on sets for all to authenticated
  using (my_role() in ('editor', 'admin')) with check (my_role() in ('editor', 'admin'));

create policy "members read" on cards for select to authenticated
  using (my_role() in ('player', 'editor', 'admin'));
create policy "editors write" on cards for all to authenticated
  using (my_role() in ('editor', 'admin')) with check (my_role() in ('editor', 'admin'));

create policy "members read" on copies for select to authenticated
  using (my_role() in ('player', 'editor', 'admin'));
create policy "editors write" on copies for all to authenticated
  using (my_role() in ('editor', 'admin')) with check (my_role() in ('editor', 'admin'));

create policy "members read" on card_events for select to authenticated
  using (my_role() in ('player', 'editor', 'admin'));
