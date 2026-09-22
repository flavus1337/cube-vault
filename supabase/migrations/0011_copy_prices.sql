-- A copy is worth what its own printing and finish cost. The card's price is
-- the plain one of the main printing, which says nothing about a foil from a
-- Comic-Con set, so each stack of copies carries its own price.

alter table copies add column price_eur real;

-- Written by the price refresh on the website, one statement for many rows.
create function set_copy_prices(rows jsonb) returns int
language sql set search_path = public as $$
  with updated as (
    update copies c set price_eur = (r->>'price_eur')::real
    from jsonb_array_elements(rows) r
    where c.print_id = r->>'print_id' and c.finish = r->>'finish'
    returning 1
  )
  select count(*)::int from updated;
$$;

-- Adding a copy can bring the price along, e.g. from the version list.
drop function add_copy(text, text, text, text, text);

create function add_copy(p_print_id text, p_card_id text, p_lang text,
                         p_source text default 'scan', p_finish text default 'nonfoil',
                         p_price real default null)
returns int language plpgsql set search_path = public as $$
begin
  perform set_config('cube.source', p_source, true);
  insert into copies (print_id, card_id, lang, qty, finish, price_eur)
  values (p_print_id, p_card_id, p_lang, 1, p_finish, p_price)
  on conflict (print_id, finish) do update
    set qty = copies.qty + 1,
        price_eur = coalesce(excluded.price_eur, copies.price_eur);
  return (select coalesce(sum(qty), 0)::int from copies where card_id = p_card_id);
end $$;
