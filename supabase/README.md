# Datenbank

Supabase (Postgres) mit Row Level Security. Die Migrationen liegen in
`migrations/` und werden der Reihe nach im SQL-Editor ausgeführt; sie bauen
aufeinander auf und laufen nur einmal.

| Datei | Was dazukam |
|---|---|
| `0001_prototype.sql` | erste Testtabelle, von 0002 wieder entfernt |
| `0002_cube_vault.sql` | Spieler, Sets, Karten, Kopien, Verlauf, Rollen, RLS |
| `0003_sub_sets.sql` | `sets.parent_code` für Bonusbögen |
| `0004_change_source.sql` | der Verlauf merkt sich App oder Website |
| `0005_private_cards.sql` | eigene Karten je Spieler |
| `0006_decks.sql` | Decks und Deckkarten |
| `0007_set_prices.sql` | Preise in einem Rutsch schreiben |
| `0008_legalities.sql` | Formate je Karte |
| `0009_card_tags.sql` | Schlagwörter aus dem Tagger |
| `0010_finishes.sql` | Folierung je Kopie (Normal, Foil, Etched) |
| `0011_copy_prices.sql` | Preis je Kopie, nicht nur je Karte |

## Rollen

`profiles.role` ist `waiting`, `player`, `editor` oder `admin`. Der erste Login
wird Admin, alle weiteren warten auf Freigabe. Lesen darf jedes Mitglied,
schreiben an Sets, Karten, Kopien und Schlagwörtern nur `editor` und `admin`.
Eigene Karten und Decks sieht nur, wem sie gehören.

## Neue Migration

Datei mit der nächsten Nummer anlegen und vorher lokal prüfen:

```sh
docker run -d --rm --name cubetest -e POSTGRES_PASSWORD=x postgres:17-alpine
# auth-Schema stubben (auth.users, auth.uid), dann alle Migrationen der Reihe nach
```

Danach im Supabase-SQL-Editor ausführen. Website und App müssen mit dem alten
und dem neuen Schema umgehen können, solange nicht alle die neue App haben.
