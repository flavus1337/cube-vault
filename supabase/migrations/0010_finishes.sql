-- Foil, etched foil or plain: a copy carries its own finish, so a stack can
-- hold two normal cards and one foil of the same print.

alter table copies add column finish text not null default 'nonfoil'
  check (finish in ('nonfoil', 'foil', 'etched'));
alter table copies drop constraint copies_pkey;
alter table copies add primary key (print_id, finish);

alter table private_cards add column finish text not null default 'nonfoil'
  check (finish in ('nonfoil', 'foil', 'etched'));
alter table private_cards drop constraint private_cards_pkey;
alter table private_cards add primary key (owner, print_id, finish);

-- The history says which finish was scanned, next to where the change came from.
create or replace function log_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d int;
  finish text;
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
    finish := coalesce(new.finish, old.finish);
    if d <> 0 then
      insert into card_events (action, set_code, card_id, delta, note)
      select case when d > 0 then 'copy_added' else 'copy_removed' end, c.set_code, c.id, d,
             nullif(concat_ws(' · ',
                              nullif(current_setting('cube.source', true), ''),
                              case finish when 'foil' then 'Foil'
                                          when 'etched' then 'Etched Foil' end), '')
      from (select coalesce(new.card_id, old.card_id) as id) x
      left join cards c using (id);
    end if;

  elsif tg_table_name = 'profiles' then
    insert into card_events (action, player_id, note)
    values ('player_role', new.id, old.role || ' → ' || new.role);
  end if;
  return null;
end $$;

-- Scanning ----------------------------------------------------------------------

drop function add_copy(text, text, text, text);
drop function remove_copy(text, text, text);

create function add_copy(p_print_id text, p_card_id text, p_lang text,
                         p_source text default 'scan', p_finish text default 'nonfoil')
returns int language plpgsql set search_path = public as $$
begin
  perform set_config('cube.source', p_source, true);
  insert into copies (print_id, card_id, lang, qty, finish)
  values (p_print_id, p_card_id, p_lang, 1, p_finish)
  on conflict (print_id, finish) do update set qty = copies.qty + 1;
  return (select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id);
end $$;

create function remove_copy(p_print_id text, p_card_id text,
                            p_source text default 'scan', p_finish text default 'nonfoil')
returns int language plpgsql set search_path = public as $$
begin
  perform set_config('cube.source', p_source, true);
  delete from copies where print_id = p_print_id and finish = p_finish and qty <= 1;
  update copies set qty = qty - 1 where print_id = p_print_id and finish = p_finish;
  return (select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id);
end $$;

-- Own cards ---------------------------------------------------------------------

create or replace function add_private_copy(card jsonb) returns int
language sql set search_path = public as $$
  insert into private_cards
  select (jsonb_populate_record(
    null::private_cards,
    -- defaults first, the scanned card second, our own columns last
    jsonb_build_object('type_line', '', 'mana_cost', '', 'colors', '', 'cmc', 0, 'lang', 'en',
                       'finish', 'nonfoil')
    || card
    || jsonb_build_object('owner', auth.uid(), 'qty', 1, 'added_at', now())
  )).*
  on conflict (owner, print_id, finish) do update set qty = private_cards.qty + 1
  returning qty;
$$;

drop function remove_private_copy(text);

create function remove_private_copy(p_print_id text, p_finish text default 'nonfoil') returns int
language sql set search_path = public as $$
  delete from private_cards
   where owner = auth.uid() and print_id = p_print_id and finish = p_finish and qty <= 1;
  update private_cards set qty = qty - 1
   where owner = auth.uid() and print_id = p_print_id and finish = p_finish;
  select coalesce((select qty from private_cards
                    where owner = auth.uid() and print_id = p_print_id and finish = p_finish), 0);
$$;
