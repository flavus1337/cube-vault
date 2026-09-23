-- How much each player keeps outside the cube — as numbers only. Card names,
-- deck names and what is in them stay with their owner: this returns counts,
-- nothing else, and only to an admin.

create function player_totals()
returns table (
  owner uuid,
  private_cards int,
  private_copies int,
  decks int,
  deck_cards int
)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(cards.rows, 0),
         coalesce(cards.copies, 0),
         coalesce(built.decks, 0),
         coalesce(built.cards, 0)
  from profiles p
  left join (
    select owner, count(*)::int as rows, coalesce(sum(qty), 0)::int as copies
    from private_cards group by owner
  ) cards on cards.owner = p.id
  left join (
    select d.owner, count(distinct d.id)::int as decks, count(dc.print_id)::int as cards
    from decks d left join deck_cards dc on dc.deck_id = d.id group by d.owner
  ) built on built.owner = p.id
  -- Anyone else gets an empty table, not an error.
  where my_role() = 'admin';
$$;
