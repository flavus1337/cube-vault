# Cubist

Shared Magic cube for a group of players: an Android app scans the cards, a
website shows the cube, and Supabase holds the data.

The cube is what you own. Scanning a card adds it; the first card of a new set
pulls in the whole set, so the website can also show which cards are missing.

## Parts

| Folder | What it is |
| --- | --- |
| `lib/` | Flutter app (Android): Discord login, camera scanner, cube list |
| `web/` | Website (Vite + React + TypeScript): cube, history, sets, players |
| `supabase/migrations/` | Database schema, run in order in the Supabase SQL editor |

Card data comes from [Scryfall](https://scryfall.com), with German names, type
lines and images where they exist. Scryfall allows about 2 searches per second,
so imports pause between requests.

## Roles

A new Discord login starts as `waiting` and sees nothing. An admin approves it.

- **player** — reads the cube
- **editor** — scans, picks sets, excludes cards
- **admin** — approves players and hands out roles

The very first login becomes admin.

## Website

```sh
cd web
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # search language, run by Node
```

The cube search reads a Scryfall-style query: `c:r mv<=2 -t:land`,
`o:"opfere" is:missing`, `(c:u or c:b) r>=rare`, `otag:removal`. The rules live
in `web/src/query.ts`, the examples behind the "Suchhilfe" button.

Oracle tags come from Scryfall's Tagger project. They are not part of a card's
data, so an editor loads them with "Schlagwörter laden"; they land in
`card_tags` (`web/src/tags.ts`).

Every push to `main` builds the website and publishes it to GitHub Pages
(`.github/workflows/website.yml`). The Pages address must be listed under
*Authentication → URL Configuration → Redirect URLs* in Supabase.

## App

```sh
fvm flutter run                 # debug on a connected phone
fvm flutter build apk --release # release build
fvm flutter test && fvm flutter analyze
```

Release builds are signed with the keystore named in `android/key.properties`
(see `key.properties.example`). Without that file the debug key is used, and the
app can't be installed over a release build.

`tools/release.sh "Was ist neu"` builds, tags and publishes. Two things the
release depends on:

- The file has to be named `cube-vault.apk`. The website and the update check
  in the app both load `releases/latest/download/cube-vault.apk`.
- The build number in `pubspec.yaml` (`0.6.0+2018`) counts in the 2000s and has
  to grow. Android installs no build number below the one on the phone; v0.4.2
  went out as 2016, so a smaller number gives "App nicht installiert".

## Backup

`tools/backup.sh` zieht jede Nacht um 01:00 einen `pg_dump` und legt ihn im
privaten Repo `cube-vault-backup` unter `history/<datum>/` ab. Als Dateien
liegen dort die letzten 14 Tage, alles Ältere bleibt in der Git-Historie. Eingerichtet wird der Lauf einmal mit:

```sh
cp tools/de.prigl.cube-vault-backup.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/de.prigl.cube-vault-backup.plist
```

Die Verbindungszeichenfolge steht in `~/.config/cube-vault/backup.env`
(`chmod 600`), nie im Repo. Wie man einen Stand zurückspielt, steht im
Backup-Repo.

## Supabase

`lib/config.dart` and `web/src/supabase.ts` hold the project URL and the
publishable key. Both are public; the access rules (RLS) allow reads only for an
approved login and writes only for editors and admins.
