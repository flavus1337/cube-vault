-- Record where a change came from: scanning in the app, or the buttons on the
-- website. The functions put it into a session setting the trigger reads.

drop function add_copy(text, text, text);
drop function remove_copy(text, text);

create function add_copy(p_print_id text, p_card_id text, p_lang text, p_source text default 'scan')
returns int language sql set search_path = public as $$
  select set_config('cube.source', p_source, true);
  insert into copies (print_id, card_id, lang, qty) values (p_print_id, p_card_id, p_lang, 1)
  on conflict (print_id) do update set qty = copies.qty + 1;
  select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id;
$$;

create function remove_copy(p_print_id text, p_card_id text, p_source text default 'scan')
returns int language sql set search_path = public as $$
  select set_config('cube.source', p_source, true);
  delete from copies where print_id = p_print_id and qty <= 1;
  update copies set qty = qty - 1 where print_id = p_print_id;
  select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id;
$$;

create or replace function log_event() returns trigger
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
      insert into card_events (action, set_code, card_id, delta, note)
      select case when d > 0 then 'copy_added' else 'copy_removed' end, c.set_code, c.id, d,
             nullif(current_setting('cube.source', true), '')
      from (select coalesce(new.card_id, old.card_id) as id) x
      left join cards c using (id);
    end if;

  elsif tg_table_name = 'profiles' then
    insert into card_events (action, player_id, note)
    values ('player_role', new.id, old.role || ' → ' || new.role);
  end if;
  return null;
end $$;
