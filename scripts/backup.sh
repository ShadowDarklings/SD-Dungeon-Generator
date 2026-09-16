#!/bin/sh
set -eu
umask 077
: "${BACKUP_REPOSITORY:?Set an off-host restic repository}"
: "${RESTIC_PASSWORD_FILE:?Set a root-readable restic password file}"
: "${PGHOST:?Set the private database host}"
: "${PGUSER:?Set a backup-capable database user}"
: "${PGDATABASE:?Set the database name}"
# PGPASSFILE avoids placing the database password in process arguments.
export RESTIC_REPOSITORY="$BACKUP_REPOSITORY"
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT HUP INT TERM
pg_dump --format=custom --no-owner --file="$tmp/game.dump"
pg_restore --list "$tmp/game.dump" > "$tmp/manifest.txt"
restic backup --tag sd-game "$tmp/game.dump" "$tmp/manifest.txt"
restic forget --tag sd-game --group-by tags --keep-within 30d --prune
restic check
