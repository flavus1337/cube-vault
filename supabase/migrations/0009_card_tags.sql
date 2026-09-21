-- Oracle tags from Scryfall's Tagger project, e.g. removal, ramp, counterspell.
-- They are not part of a card's data, so they are fetched per tag and stored here.

create table card_tags (
  card_id text not null references cards on delete cascade,
  tag text not null,
  primary key (card_id, tag)
);
create index card_tags_tag on card_tags (tag);

alter table card_tags enable row level security;

create policy "members read" on card_tags for select to authenticated
  using (my_role() in ('player', 'editor', 'admin'));
create policy "editors write" on card_tags for all to authenticated
  using (my_role() in ('editor', 'admin')) with check (my_role() in ('editor', 'admin'));
