# DigitalOcean production runbook

## Latest release

Runtime release `86105cc` was deployed and verified on 2026-09-24 UTC
(2026-09-23 Pacific). It fixes hand equipment, independent burning/equipped
lights, first-light initialization, starting-room imports, shared-coin purchases,
and STR-based unarmed attacks for exactly 1 damage. See
`EQUIPMENT_LIGHT_REPAIR_2026-09-23.md` for the rules and regression coverage.

The final live pass verified anonymous core/all-sources imports, host and
account-free guest imports, host-after-guest import, peer movement, equipment/AC/
light changes, purchases without XP loss, and host/guest exit. All five imports
took 4.9-5.7 seconds. Page usable in 1.49 seconds, all art ready in 5.72 seconds,
generation 0.39 seconds, 30/30 local moves with median 9.9 ms and p95 13 ms.
No browser errors or container OOM kills occurred. One earlier all-sources
import timed out at the upstream browser step; subsequent full runs succeeded.
The importer was not changed by this release; treat intermittent upstream
timeouts as a remaining operational risk, not a resolved issue.

Protected backup: `/root/shadowspawner-equipment-backup-20260923`; rollback image:
`shadowspawner:pre-equipment-20260923`. Only the app was rebuilt/replaced.
Secrets, database volumes, importer, native nginx and portfolio were preserved.
Audit artifacts and guarded disposable-account cleanup scripts are in
`C:\SD_game\deployment-equipment-20260923`.

## Previous release

Runtime release `aba4d37` was deployed and verified on 2026-09-23 UTC.
Only the app container was rebuilt/replaced; the database, Redis and importer
stayed running. Solo visitors may now import without accounts. Room imports
still enforce membership and host permissions. Successful import quotas are
32/minute and 256/hour per player (IP for unaffiliated visitors), with a larger
shared-IP ceiling; failed/busy imports do not consume those quotas. The legacy
anonymous-development bypass is not needed or enabled in production.

The same release adds the character-colored attack cursor and makes the
Multiplayer popup explicit-button-only, including room reloads and invite links.
Five real HTTPS imports passed: anonymous core/all-sources, signed-in host,
account-free room guest, and host after guest (4.8-6.4 seconds each). Live
generation took 0.42 seconds; 30/30 local keypress moves succeeded with median
8.9 ms and p95 15.6 ms. Guest movement synchronized to the host; both could leave.
Desktop/mobile reloads kept the popup closed, cursor alpha/tint checks passed,
and there were no browser errors or container OOM kills.

Backup: `/root/shadowspawner-backup-20260923`; rollback app image:
`shadowspawner:pre-public-import-20260923`. Secrets, native nginx, Compose
override and portfolio were unchanged. Verification artifacts and the exact
disposable-account cleanup are in `C:\SD_game\deployment-repair-20260923`.
Access used the owner's renewed standard SSH configuration; this release did
not create, replace or remove SSH keys.

## Actual deployment

Verified 2026-09-21 UTC (2026-09-20 Pacific):

- Domain: `https://ctreeder.com`; ShadowSpawner: `/site/`.
- Droplet: `ctr-portfolio-sd`, ID `586249603`, IPv4 `157.230.143.58`.
- Ubuntu 24.04, 1 vCPU, 1 GB RAM. Do not purchase a resize without approval.
- Checkout: `/opt/SD-Dungeon-Generator`, branch `main`.
- Compose files: `docker-compose.yml` plus the untracked production-specific
  `docker-compose.digitalocean.yml`. Always pass both files.
- Native nginx owns ports 80/443. Do NOT start the Compose `nginx` service or
  overwrite the native site with the repository Docker nginx template.
- Native site: `/etc/nginx/sites-enabled/ctreeder.com`, normally a symlink into
  `/etc/nginx/sites-available/`.
- Live portfolio: `/var/www/ctreeder.com/html`. It has live-only content; preserve
  it rather than replacing it wholesale with `S3_content/portfolio`.
- `.env` contains production secrets. Never print it, copy it to local reports,
  regenerate the session secret, or replace it with development defaults.
- A Git push does not deploy automatically. `.github/workflows/test.yml` is CI.

## Service boundaries

The app publishes port 8000 only on `127.0.0.1`. nginx proxies API/account routes
there, but serves `/site/` directly from
`/opt/SD-Dungeon-Generator/S3_content/`. Static responses preserve security
headers and use gzip for CSS, JavaScript, JSON and SVG. A failed importer or
web worker must not prevent the game document and images from loading.

The private `importer` service publishes no host port, has no account/database
secrets, and runs Chromium as user `game` with its sandbox enabled. Only this
container has `SYS_ADMIN`; the app does not. Its explicit Gunicorn config is
`importer_gunicorn.conf.py`, not the web application's default config with
database hooks. Keep `SHADOWDARKLINGS_IMPORT_URL=http://importer:9000/import` and
`SHADOWDARKLINGS_IMPORT_ENABLED=1`. Never enable the local anonymous bypass.

The 1 GB droplet needs room for the web workers, persistent Node rules workers,
Chromium, Postgres, Docker and the OS. Production overrides both app and importer
to `mem_limit: 448m` and `memswap_limit: 768m`; importer CPU is capped at `0.75`
and process count at 96, app at 128. `/sd_swap` is a 1 GB, mode-600 swap file,
managed by the enabled `sd_swap.swap` systemd unit. This uses existing disk,
not a paid resize. Inspect memory pressure and swap use under real multiplayer
load before lowering limits; 320 MB app / 384 MB importer reproduced stalls.

## Safe updates

1. Confirm authorized SSH/console access. Do not scan for credentials. Temporary
   maintenance keys must expire and be removed after verification.
2. Record checkout status/revision, container images, CPU/RAM/disk, nginx errors,
   app/importer errors and cgroup `memory.events`. Preserve uncommitted changes.
3. Make a protected `pg_dump -Fc` backup using the existing `sd_owner` role and
   verify it with `pg_restore --list`. Back up `.env`, the production Compose
   override, native nginx config and live portfolio. Retain the previous image.
   Do not use `docker compose down -v`, reset the database or delete volumes.
4. Fetch and fast-forward the reviewed release. Preserve the untracked override.
5. Validate the merged config with `docker compose ... config --quiet` (not full
   config output, which contains secrets). Build the affected services.
6. Start only the intended services. For a full application release:

```bash
cd /opt/SD-Dungeon-Generator
docker compose -f docker-compose.yml -f docker-compose.digitalocean.yml build app importer migrate
docker compose -f docker-compose.yml -f docker-compose.digitalocean.yml up -d --no-build --wait --wait-timeout 150 app
```

7. For native nginx edits, keep a rollback copy, run `nginx -t`, then reload
   gracefully. Do not increase gateway timeouts as a substitute for repair.
8. Verify HTTPS `/site/`, assets, `/api/session`, `/healthz`, both core-only and
   all-sources imports, host and account-free guest imports, a subsequent host
   import, movement/peer updates, and leaving/closing a room. Use disposable
   test accounts/rooms, never real saved games, and remove only those fixtures.
9. Confirm services are healthy, no unexpected public ports exist, secrets and
   database volumes are unchanged, and temporary access is revoked.

The 2026-09-21 repair backup is `/root/shadowspawner-backup-20260921` (mode 700),
including `app.dump`, configuration, portfolio and the previous revision/image.
The prior image is tagged `shadowspawner:pre-repair-20260921`.

See `PERFORMANCE_REPAIR_2026-09-19.md` for the original before/after CPU and
asset-waterfall measurements. Do not confuse local timings with live results.
