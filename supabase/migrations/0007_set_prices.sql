-- Writing prices with an upsert fails: Postgres checks the not-null columns of
-- the new row before it sees that the row already exists. These functions
-- update many prices in one statement instead.

create function set_prices(rows jsonb) returns int
language sql set search_path = public as $$
  with updated as (
    update cards c set price_eur = (r->>'price_eur')::real
    from jsonb_array_elements(rows) r
    where c.id = r->>'id'
    returning 1
  )
  select count(*)::int from updated;
$$;

create function set_private_prices(rows jsonb) returns int
language sql set search_path = public as $$
  with updated as (
    update private_cards p set price_eur = (r->>'price_eur')::real
    from jsonb_array_elements(rows) r
    where p.owner = auth.uid() and p.print_id = r->>'print_id'
    returning 1
  )
  select count(*)::int from updated;
$$;
