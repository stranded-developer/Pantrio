#!/usr/bin/env bash
# Decrypt a nightly backup (.github/workflows/db-backup.yml) and, optionally,
# restore it into a database.
#
#   1. GitHub → Actions → "Database backup" → a run → Artifacts → download, unzip
#   2. scripts/restore-backup.sh pantrio-2026-10-27_0530.dump.gpg
#        → asks for BACKUP_PASSPHRASE, writes pantrio-2026-10-27_0530.dump
#   3. To restore (into a NEW, empty Supabase project — never over live data):
#        scripts/restore-backup.sh pantrio-….dump.gpg "postgresql://postgres.<ref>:<pw>@<pooler>:5432/postgres"
#
# Needs gpg and Docker (uses the postgres:17 image for pg_restore).
set -euo pipefail

in="${1:?usage: restore-backup.sh <file.dump.gpg> [target-db-url]}"
target="${2:-}"
out="${in%.gpg}"

gpg --pinentry-mode loopback -d -o "$out" "$in"
echo "Decrypted → $out"
docker run --rm -v "$PWD:/w" postgres:17 pg_restore --list "/w/$(basename "$out")" | grep -c "TABLE DATA" \
  | xargs -I{} echo "Contains {} tables with data"

if [ -n "$target" ]; then
  read -r -p "Restore into $(echo "$target" | sed -E 's#//[^@]+@#//***@#')? Type yes: " ok
  [ "$ok" = "yes" ] || { echo "Cancelled."; exit 1; }
  docker run --rm -v "$PWD:/w" postgres:17 pg_restore --no-owner --no-privileges -d "$target" "/w/$(basename "$out")"
  echo "Restored."
fi
