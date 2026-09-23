-- A copy knows which printing it is. Until now it only carried the Scryfall
-- id, so the website could not tell a Comic-Con foil from a foil of the
-- card's own printing: both read "Foil · EN".

alter table copies add column set_code text;
alter table copies add column number text;

-- Scanning and the version list both know the printing, so they pass it along.
drop function add_copy(text, text, text, text, text, real);

create function add_copy(p_print_id text, p_card_id text, p_lang text,
                         p_source text default 'scan', p_finish text default 'nonfoil',
                         p_price real default null,
                         p_set text default null, p_number text default null)
returns int language plpgsql set search_path = public as $$
begin
  perform set_config('cube.source', p_source, true);
  insert into copies (print_id, card_id, lang, qty, finish, price_eur, set_code, number)
  values (p_print_id, p_card_id, p_lang, 1, p_finish, p_price, p_set, p_number)
  on conflict (print_id, finish) do update
    set qty = copies.qty + 1,
        price_eur = coalesce(excluded.price_eur, copies.price_eur),
        set_code = coalesce(excluded.set_code, copies.set_code),
        number = coalesce(excluded.number, copies.number);
  return (select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id);
end $$;

-- The price run fills in what the older copies are missing.
create or replace function set_copy_prices(rows jsonb) returns int
language sql set search_path = public as $$
  with updated as (
    update copies c
       set price_eur = (r->>'price_eur')::real,
           set_code = coalesce(r->>'set_code', c.set_code),
           number = coalesce(r->>'number', c.number)
    from jsonb_array_elements(rows) r
    where c.print_id = r->>'print_id' and c.finish = r->>'finish'
    returning 1
  )
  select count(*)::int from updated;
$$;
