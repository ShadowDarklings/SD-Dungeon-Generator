#!/bin/sh
set -eu
: "${RESTORE_DATABASE_URL:?Set a disposable staging database URL}"
: "${RESTORE_CONFIRMATION:?Set RESTORE_CONFIRMATION=DISPOSABLE_DATABASE}"
[ "$RESTORE_CONFIRMATION" = DISPOSABLE_DATABASE ] || exit 2
[ "$#" -eq 1 ] || { printf '%s\n' 'Usage: verify_restore.sh path/to/game.dump'; exit 2; }
# Never pass the production URL. No --clean: the target must already be empty.
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$1"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS accounts FROM users; SELECT count(*) AS games FROM saved_runs; SELECT count(*) AS rooms FROM game_rooms;'
printf '%s\n' 'Database restored. Run the named-game and two-player acceptance checks against this staging database.'
