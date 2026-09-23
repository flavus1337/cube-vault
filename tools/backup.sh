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

# Supabase runs Postgres 17; a newer pg_dump refuses to talk to it, so the
# container brings the matching one when the local client is too new.
dump() {
  if pg_dump --version | grep -qE ' 1[0-7]\.'; then
    pg_dump "$@"
  else
    docker run --rm -i postgres:17-alpine pg_dump "$@"
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

# Two files, always the same names: git keeps the days and stores only what
# changed from one to the next.
dump "$SUPABASE_DB_URL" --schema-only --schema=public --no-owner --no-privileges > schema.sql
dump "$SUPABASE_DB_URL" --data-only --schema=public --no-owner --disable-triggers \
  --exclude-table-data='storage.*' > data.sql

rows=$(grep -c '^INSERT\|^COPY' data.sql || true)
printf 'Stand: %s\nZeilenblöcke: %s\n' "$(date '+%d.%m.%Y %H:%M')" "$rows" > STATUS.txt

git add -A
# --porcelain also sees files that are new; git diff alone would call the
# first run "unchanged" and never commit anything.
if [ -z "$(git status --porcelain)" ]; then
  echo "$(date '+%F %T') nichts geändert"
  exit 0
fi

git commit -q -m "Backup $(date '+%d.%m.%Y')"
git push -q origin HEAD
echo "$(date '+%F %T') gesichert ($(du -h data.sql | cut -f1))"
