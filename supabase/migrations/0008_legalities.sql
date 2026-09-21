-- Which formats a card is legal in, as Scryfall reports it:
-- {"commander": "legal", "legacy": "banned", …}

alter table cards add column legalities jsonb;

-- Fills prices and legalities for many cards in one statement. An upsert would
-- fail on the not-null columns of the row it pretends to insert.
create function set_card_data(rows jsonb) returns int
language sql set search_path = public as $$
  with updated as (
    update cards c
    set price_eur = coalesce((r->>'price_eur')::real, c.price_eur),
        legalities = coalesce(r->'legalities', c.legalities)
    from jsonb_array_elements(rows) r
    where c.id = r->>'id'
    returning 1
  )
  select count(*)::int from updated;
$$;
