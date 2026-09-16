# Host-Owned Dungeons: Operations and Release Gate

This change is implemented in source, not deployed by the coding task. Local
SQLite/browser tests do not establish production PostgreSQL, TLS, OAuth,
Shadowdarklings availability, or backup restore readiness.

## Architecture and Trust

- Flask authenticates every request, checks room membership and character
  ownership, and serializes changes using database locks and revision checks.
- A bounded Node 24 worker runs the existing JavaScript dungeon/combat rules.
  The browser sends allowlisted intentions, not replacement room state. The
  host submits the initial dungeon only when creating a room.
- PostgreSQL owns durable rooms, named saves, memberships and character copies.
  Redis owns shared rate limits and the browser-import concurrency lock.
- HTTP polling runs every three seconds. The host is considered absent after
  45 seconds without a heartbeat, or immediately after Leave. The game pauses
  when no browser is driving it; there is no offline catch-up simulation.
- Four-character codes deliberately trade entropy for verbal convenience.
  Codes expire after 30 minutes, are HMAC-digested at rest, and are rotated by
  the host. Join attempts are rate limited. Locking invitations prevents new
  joins. Already joined members use their room membership instead of a code.
- Guest identity is an HttpOnly, same-site cookie lasting 30 days. Joining an
  account claims the guest's memberships and character ownership. Clearing
  browser data before linking an account loses that guest identity. A removed
  anonymous guest can create another browser identity; rotate/lock invitations
  when removing an unwanted guest. Short codes are not suitable for public,
  high-value or adversarial matchmaking.
- All members receive the shared map snapshot. Fog is a presentation feature,
  not protection for secret GM notes or unrevealed content against developer
  tools. Do not put account emails or private notes in game state.
- Character sheets are intentionally editable by their owners. This is a
  cooperative tabletop game, not cheat-proof competitive progression.

## Data and Recovery

- Each account can keep 10 active named games, 50 active personal characters,
  5 open rooms, 50 retained rooms and at most 64 MiB of game/character/checkpoint
  JSON. A room holds at most 16 characters and 16 participant identities.
- Named host saves retain roster and ownership snapshots. Joined account
  members present in that snapshot can find the host's named dungeon in Load.
  They cannot overwrite, invite to, or take over that dungeon. Only the host
  can reopen a deliberately closed room.
- Live room commands are durable independently of the named checkpoint.
  Returning normally resumes the current live room. Restoring an older named
  checkpoint is an explicit host action and requires the room to be closed.
- Saving a personal character creates an independent copy. Editing or deleting
  that private copy does not alter a host's copy of the character.
- Saves use revision checks. Deleted private saves are recoverable for 30 days;
  dungeons retain at most 10 checkpoints. Run `python scripts/maintenance.py`
  daily to purge expired invitations, receipts, deleted saves and abandoned
  unsaved rooms. Arrange and monitor that schedule on the deployment host.
- Account settings provide password changes, session revocation, one-time
  recovery codes, data export and account deletion. Password length stays
  6 through 1024 characters. Recovery codes must be generated and kept before
  an account is lost. Email password reset is not enabled: SMTP delivery and
  verified-email enrollment have not been configured.
- Account deletion removes hosted rooms and private saves. Other hosts retain
  their character copies; the deleted account identity is removed from stored
  rosters. Backup retention must be configured and monitored separately.

## Existing Database Upgrade

1. Put the site in maintenance mode and take an off-host database backup. Prove
   the backup restores to a disposable database before changing live roles.
2. Preserve the existing PostgreSQL volume. Never use `down -v`, an empty-volume
   replacement, or `create_all` as a substitute for a migration.
3. Existing volumes do not rerun `docker-entrypoint-initdb.d` when environment
   variables change. A database administrator must create `sd_owner` and
   `sd_app`, transfer application schema/table/sequence ownership to
   `sd_owner`, and give `sd_app` LOGIN with NOSUPERUSER, NOCREATEDB,
   NOCREATEROLE and NOREPLICATION. Use separate generated URL-safe passwords.
   The new-volume initialization script handles the fresh-install case only.
4. Run `python scripts/migrate.py` with the schema owner's `DATABASE_URL` and
   the normal required application environment. This adds tables and additive
   columns, then grants DML/sequence access to `sd_app`. The web container must
   receive only the `sd_app` URL, never the owner's credentials.
5. Verify existing users, private character saves and named dungeon counts.
   Legacy `/api/multiplayer/sessions` endpoints now return 410. Their tables
   remain untouched for audit/recovery, but old invitations and unsaved legacy
   rooms are not automatically converted into new rooms. Hosts must start a
   new invitation from their saved dungeon after this upgrade.
6. Keep a rollback build and the tested backup. Do not run the old application
   against new rooms expecting it to understand them. A database rollback can
   discard writes made after the backup; communicate a maintenance window.

## Production Configuration

- Use `.env.example` as the variable inventory. Keep a stable, random
  `SECRET_KEY` of at least 32 characters outside source control. Changing it
  invalidates sessions, guest identities, invitations and recovery codes.
- `docker-compose.yml` separates the one-shot migration and runtime credentials.
  PostgreSQL and Redis have no published host ports. Nginx is the only public
  ingress; it replaces forwarded headers and rejects noncanonical hosts.
- Install a valid certificate for `ctreeder.com` in the configured certificate
  paths. Keep port 8000 and database/Redis ports private. Adapt canonical host
  and certificates together for staging; do not disable origin checks.
- Node 24 and `npm ci --omit=dev` are required even though the web framework is
  Python. The Dockerfile supplies them and runs the app as a non-root user.
- Shadowdarklings browser import is off by default in production. Enable
  `SHADOWDARKLINGS_IMPORT_ENABLED=1` only after the live importer is exercised
  with the installed Chromium and upstream site. Guest imports require an
  active joined room. Never enable `ALLOW_ANON_SHADOWDARKLINGS_IMPORT` in
  production. The import path is rate limited and globally single-flight;
  it runs in a separate process with a 60-second timeout, filtered environment,
  restricted browser host list, no downloads/service workers, and Chromium's
  sandbox required in production. Verify the host's user-namespace/seccomp
  configuration supports Chromium sandboxing; do not disable it to work around
  deployment errors. Apply an outbound firewall policy to prevent access to
  private networks/cloud metadata as defense in depth. Monitor memory and
  latency before increasing capacity.
- The application fails closed on missing shared rate-limit configuration or
  an overprivileged runtime database role. Monitor database errors, Redis
  failures, runtime timeouts, 429 rates, storage growth and failed backups.
  Do not log passwords, recovery codes, cookies, request bodies or invitation
  query strings. The supplied nginx/Gunicorn access formats omit query strings.
- Scale testing is still required. Each Flask process serializes Node commands;
  polling transfers full snapshots when revisions change. Start with a small
  private group and measure latency/CPU before increasing concurrent rooms.

## Encrypted Off-Host Backups

Install PostgreSQL client tools and restic on a trusted maintenance host. Set
`BACKUP_REPOSITORY` to an off-host repository, `RESTIC_PASSWORD_FILE` to a
restricted credential file, and `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSFILE`.
Initialize the repository once, then schedule `scripts/backup.sh` daily. It
creates a custom-format dump, validates its archive manifest, encrypts and
uploads through restic, applies 30-day retention and checks the repository.

Keep the restic key and a protected copy of the application's stable secret in
separate disaster-recovery storage. The application container must not receive
backup credentials. Monitor successful completion and age of the newest copy.

Restore the latest dump to an empty, disposable PostgreSQL database using
`scripts/verify_restore.sh`. Use a password-free `RESTORE_DATABASE_URL` with
`PGPASSFILE`; set `RESTORE_CONFIRMATION=DISPOSABLE_DATABASE`. Inspect restored users,
characters, membership ownership and a representative saved room, then run the
application against that disposable database. An archive manifest alone is not
a recovery test. Repeat restore drills after schema changes and periodically.

## Release Gate

- Run CI's SQLite and PostgreSQL suites, JavaScript tests, dependency audits and
  tracked-secret check. Protect the deployment branch using those results.
- Run `scripts/check_room_browser.py` against its isolated local preview for
  desktop/mobile guest ownership, movement, host absence and roster ordering.
  This test stubs the upstream character importer only.
- On staging, verify real TLS, secure session/remember/guest cookies, CSRF,
  registration with six-character and long passwords, recovery codes, OAuth,
  real Shadowdarklings import, invitation expiry/rotation, concurrent saves,
  reconnect, combat, host absence and account-linked return via a named save.
- Restart the web workers and database and confirm room persistence. Test with
  two actual devices and a slow/disconnected connection. Verify no unexpected
  token movement or duplicated action after retry.
- Complete an encrypted off-host backup and a disposable restore drill.
  These deployment checks have not been performed by the local coding task.
