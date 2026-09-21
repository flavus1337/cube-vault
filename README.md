# Cube Vault

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
`o:"opfere" is:missing`, `(c:u or c:b) r>=rare`. The rules live in
`web/src/query.ts`, the examples behind the "Suchhilfe" button.

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

## Supabase

`lib/config.dart` and `web/src/supabase.ts` hold the project URL and the
publishable key. Both are public; the access rules (RLS) allow reads only for an
approved login and writes only for editors and admins.
