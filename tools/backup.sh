#!/usr/bin/env bash
# A day's copy of the database, as SQL that can be played back. Runs from
# launchd at 01:00; see tools/de.prigl.cube-vault-backup.plist.
#
# The connection string lives in ~/.config/cube-vault/backup.env, which is
# read only by you and never in git. Take the session pooler string from
# Supabase (Connect → Session pooler): the direct host db.<ref>.supabase.co
# answers on IPv6 only, which most home networks cannot reach.
#   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres
set -euo pipefail

env_file="${CUBE_BACKUP_ENV:-$HOME/.config/cube-vault/backup.env}"
repo="${CUBE_BACKUP_REPO:-$HOME/Documents/projects/cube-vault-backup}"

if [ ! -f "$env_file" ]; then
  echo "Keine Zugangsdaten in $env_file — siehe tools/backup.sh" >&2
  exit 1
fi
# shellcheck disable=SC1090
. "$env_file"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL fehlt in $env_file}"

if [ ! -d "$repo/.git" ]; then
  echo "Kein Backup-Repo unter $repo" >&2
  exit 1
fi

# launchd starts with a bare PATH, so the client is looked for where Homebrew
# keeps it. Supabase runs Postgres 17 and a newer pg_dump refuses to talk to
# it; then the container brings the matching one.
find_pg_dump() {
  local candidate
  for candidate in \
    "${PG_DUMP:-}" \
    /opt/homebrew/opt/postgresql@17/bin/pg_dump \
    /opt/homebrew/opt/libpq/bin/pg_dump \
    /usr/local/opt/postgresql@17/bin/pg_dump \
    /usr/local/opt/libpq/bin/pg_dump \
    "$(command -v pg_dump 2>/dev/null || true)"
  do
    [ -x "$candidate" ] || continue
    if "$candidate" --version | grep -qE ' 1[0-7]\.'; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

pg_dump_bin=$(find_pg_dump || true)

dump() {
  if [ -n "$pg_dump_bin" ]; then
    "$pg_dump_bin" "$@"
  elif docker info >/dev/null 2>&1; then
    docker run --rm -i postgres:17-alpine pg_dump "$@"
  else
    echo "Kein pg_dump für Postgres 17 gefunden und Docker läuft nicht." >&2
    echo "Entweder Docker starten oder: brew install postgresql@17" >&2
    exit 1
  fi
}

# The direct host has no IPv4 address; say so instead of letting pg_dump fail
# with "Network unreachable".
host=$(printf '%s' "$SUPABASE_DB_URL" | sed -E 's|.*@([^:/]+).*|\1|')
case "$host" in
  db.*.supabase.co)
    if ! dig +short A "$host" | grep -q .; then
      echo "»$host« antwortet nur über IPv6. Nimm in Supabase unter Connect die" >&2
      echo "Zeichenfolge des Session Pooler (aws-…pooler.supabase.com:5432)." >&2
      exit 1
    fi
    ;;
esac

cd "$repo"
git pull -q --rebase --autostash 2>/dev/null || true

# One folder per day. The \restrict line pg_dump writes carries a fresh token
# every run, which would make every night look like a change; psql reads the
# dump without it.
steady() { grep -v '^\\\(un\)\?restrict ' ; }

today=$(date '+%Y-%m-%d')
mkdir -p "history/$today"
dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges \
  | steady > "history/$today/schema.sql"
dump "$SUPABASE_DB_URL" --data-only --schema=public --no-owner --disable-triggers \
  --exclude-table-data='storage.*' | steady > "history/$today/data.sql"

# Two weeks lie around as files; everything before that stays in the history,
# where `git log` and `git show` still reach it.
keep_from=$(date -v-14d '+%Y-%m-%d' 2>/dev/null || date -d '14 days ago' '+%Y-%m-%d')
for day in history/*/; do
  name=$(basename "$day")
  [ "$name" \< "$keep_from" ] && rm -rf "$day"
done

rows=$(grep -c '^INSERT\|^COPY' "history/$today/data.sql" || true)
{
  printf 'Stand: %s\nZeilenblöcke: %s\nAls Dateien: %s Tage ab %s\n' \
    "$(date '+%d.%m.%Y %H:%M')" "$rows" "$(ls history | wc -l | tr -d ' ')" "$keep_from"
} > STATUS.txt

git add -A
# --porcelain also sees files that are new; git diff alone would call the
# first run "unchanged" and never commit anything.
if [ -z "$(git status --porcelain)" ]; then
  echo "$(date '+%F %T') nichts geändert"
  exit 0
fi

git commit -q -m "Backup $(date '+%d.%m.%Y')"
git push -q origin HEAD
echo "$(date '+%F %T') gesichert ($(du -h "history/$today/data.sql" | cut -f1))"
