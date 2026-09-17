-- Bonus sheets and commander decks are their own Scryfall set but belong to a
-- main set, e.g. "Bloomburrow Special Guests" (spg) to Bloomburrow (blb).
alter table sets add column parent_code text;
