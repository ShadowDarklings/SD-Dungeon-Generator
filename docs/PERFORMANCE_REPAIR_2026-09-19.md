# ShadowSpawner performance and outage audit

## Production status

The in-app browser reproduced `504 Gateway Time-out`, advertised by
`nginx/1.24.0 (Ubuntu)`, at `https://ctreeder.com/site/`. The portfolio homepage
rendered. This is a server/upstream failure, not evidence of inadequate client
bandwidth. The exact failure (stalled workers, memory pressure, database waits,
or incorrect proxy configuration) cannot be established without server logs.

Production was repaired on 2026-09-21 UTC (2026-09-20 Pacific), after the owner
granted temporary SSH access. The live checkout had still been at `fd2e889`.
The performance release `9f54fc2` is now deployed, with the importer startup
follow-up `383c129`. See `DIGITALOCEAN_DEPLOYMENT.md` for the verified deployment
paths and procedure. The native Ubuntu nginx deployment differs from the
repository's Docker nginx template; do not replace the live site blindly.

The logs confirmed Gunicorn worker timeouts/forced termination and an image
request whose upstream connection died during worker recycling. All game assets
had been proxied through the same web workers as imports and room requests.
The droplet has only 1 GB RAM and had no swap. A real guest/all-sources test
reproduced memory pressure with initially too-small service limits. Correcting
the limits and adding a secured 1 GB disk-backed swap reserve made the same
import path succeed while normal requests remained responsive.

The private importer now has its own explicit Gunicorn configuration. Previously
Gunicorn auto-loaded the web app's config and unnecessarily imported its database
hooks, logging a missing `SECRET_KEY` error. No application secrets were added
to the importer. Accounts, saves, database volumes and the original `.env` were
preserved; database/config backups and the prior app image are retained.

## Measured bottlenecks

Measurements use Chromium, an isolated SQLite database, a deterministic level-1
dungeon (seed 12345), and a torch-bearing test character. Baseline JavaScript is
revision `472e6c6`. The before/after runs use 40 ms simulated request latency and
100 Mbps throughput. They are local measurements, not production load timings.

Approximate baseline startup critical-path shares:

| Rank | Component | Share | Finding |
| --- | --- | ---: | --- |
| 1 | Artwork loading | 83% | 299 image requests, 8.56 MB; sequential groups and door requests create an 8.32-second waterfall |
| 2 | Document, styles and JS bootstrap | 11% | 21 script resources, 0.84 MB; module discovery adds latency |
| 3 | Remaining data and initial generation | 6% | Data requests and generation complete after artwork |

These are elapsed critical-path estimates; concurrent resource durations must
not be summed. Account lookup previously preceded all asset loading and could
add an unbounded backend wait. Production 504 time is not included above.

Baseline arrow-key CPU sampling: visibility about 72%, rendering 24%, panels and
other work 4%. Geometry rules themselves were not the dominant cost.

## Repairs

- Start local dungeon generation, account lookup and artwork loading independently.
- Bound account lookup to eight seconds; a stalled account API no longer blocks
  generating or exploring a single-player dungeon.
- Deduplicate image requests and use a queue capped at eight concurrent loads.
  Preserve image variant ordering and all existing artwork. Each image has a
  15-second deadline and existing fallback handling.
- Cache unchanged terrain layers. Tokens, door states and fog still redraw.
- Reject points outside a light polygon's cached bounds and tiles beyond every
  light's possible reach before expensive ray tests.
- Avoid repeatedly cloning the entire explored-light history for every light.
  Preserve previous-view snapshots and existing visibility rules.
- Release the request database connection after import authorization and before
  waiting for the isolated Shadowdarklings worker.
- Refresh multiplayer player lists when metadata changes, without forcing
  unnecessary redraws for identical read-only polls.
- Make the portfolio dungeon preview image clickable. Align its source links
  with the current live `/site/` address instead of the retired AWS hostname.
- Enable gzip for text/CSS/JavaScript/JSON in the repository nginx template.
  This still requires validation and application on the actual production server.

## Results

| Controlled test | Before | After |
| --- | ---: | ---: |
| First usable generated dungeon | 10.07 s | 0.81 s |
| All renderer artwork ready | 10.09 s | 4.16 s |
| Generate another dungeon (including browser click/wait) | 0.45 s | 0.40 s |
| Arrow-key processing, median | 28.3 ms | 8.05 ms |
| Arrow-key processing, 95th percentile | 34.5 ms | 14.2 ms |
| Successful moves | 30/30 | 30/30 |

All four rendered canvas layers have identical before/after hashes in the
deterministic fixture. Visible and explored tile sets are also identical.

A separate real-network import through the updated local Flask backend succeeded
in 2.94 seconds. Without simulated latency, artwork was ready in 1.96 seconds
and subsequent generation took 0.23 seconds. The random imported character had
no active light, so its faster movement figures are not used for the comparison.
No JavaScript errors or failed requests occurred in that real-import run.

With `/api/session` deliberately held pending, a new single-player dungeon
became usable in 0.57 seconds. Performance tests never accessed production saves.

Validation: 84 Python tests passed, 21 environment-dependent tests skipped;
seven JavaScript tests passed. The desktop-host/mobile-guest browser suite passed
ownership, movement, ordering, host absence, permission switches, guest-account
linking, personal saves, named-room return and canvas checks. Production
PostgreSQL, nginx syntax/reload and actual multi-device latency still need checks.

Reports, screenshots and CPU profiles are under ignored `browser-checks/`.
Reproduce with `scripts/audit_game_performance.py`; `--revision 472e6c6` selects
baseline JS, `--latency-ms 40` adds network latency, and `--live-import` exercises
the actual upstream importer instead of the deterministic import fixture.

## Live verification after deployment

Final desktop-host/mobile-guest browser checks used fresh disposable accounts
and real upstream imports, not saved user data or mocked character responses.

| Live check | Result |
| --- | --- |
| Fresh usable dungeon | 1.4-3.9 s across observed runs |
| All artwork | 5.0-13.6 s across runs; final run 7.47 s |
| Generate another dungeon | 0.45 s in final run |
| Solo import | HTTP 200, 5.58 s |
| Account-free guest import | HTTP 200, 5.80 s |
| Host import after guest import | HTTP 200, 5.64 s |
| Arrow-key processing | Median 9.75 ms, 95th percentile 12.8 ms; 30/30 moves |
| Guest movement visible to host | Passed |
| Desktop/mobile canvas | All four layers nonblank; screenshots inspected |
| Character sheet close control | Dark X, white rectangular background |
| Guest leave, host close, host leave | Passed separate exit check |

The movement timing is browser-side processing, not an end-to-end network
latency guarantee. Loading varied with network/runtime conditions. The full
workflow test's final assertion initially assumed Close Dungeon also leaves the
room; actual behavior intentionally keeps the host there with Reopen Dungeon.
The assertion was corrected, and an independent live exit check passed all
three actions without spending more upstream import requests. Raw reports are
kept in `C:\SD_game\deployment-repair-20260921`.

The final workflow had no JavaScript exceptions or failed network requests.
A private all-sources check completed in 5.70 s while 12 session checks stayed
below 20 ms on the server. All app/importer/DB/Redis health checks passed; final
importer logs contained three successful imports and no startup-hook errors.
Five exact disposable test accounts and their dependent rooms were removed.
No paid server resize was made. The original secrets file was confirmed
byte-for-byte unchanged.

## Homepage link audit

All eight distinct local/fragment targets in the source exist. All twelve
distinct outgoing page URLs were probed. The live homepage's three text/logo
links already target `/site/`; its dungeon screenshot was not a link.

| Destination | Observed result |
| --- | --- |
| ShadowSpawner | Repaired; HTTP 200 in 0.64 s in final link probe |
| World map | HTTP 200 in 0.63 s |
| Illustration | HTTP 200 in 0.77 s |
| Armstrong source | HTTP 200 in 0.77 s |
| MCC generator | HTTP 200 in 0.77 s |
| Five GitHub destinations | HTTP 200 |
| LinkedIn | Automated request rejected with 999; not proven broken |
| Dungeon-master booking | Automated request rejected with 406; not proven broken |

Earlier command-line probes timed out, including pages that later rendered in
the browser. The final link audit passed all five internal destinations and all
five GitHub destinations. `scripts/audit_portfolio_links.py --live` records the
per-link results. External bot rejections do not prove those sites are broken.

## Recovery procedure used

1. Complete DigitalOcean sign-in and open the existing droplet console. Identify
   the running service, checkout, actual nginx site configuration and revision.
2. Capture memory/CPU/disk usage, worker/process counts, nginx upstream errors,
   service/container logs and kernel out-of-memory events before restarting.
   Do not print environment secrets, session cookies or saved character data.
3. Restore only the affected application/import service after identifying it.
   Preserve the database, volumes, stable session secret and portfolio files.
4. Back up current configuration and data. Deploy the tested application source,
   including the earlier bounded import-worker fixes. Keep Chromium work in the
   resource-limited private importer service, not in the web worker pool.
5. Serve `/site/` and its static assets directly through nginx so an unavailable
   application worker cannot prevent offline single-player startup. Inspect the
   existing alias/root paths first; run `nginx -t` before a reload.
6. Repeat public `/site/`, `/api/session`, image, real import, generation and
   movement checks; test two devices. Compare nginx request/upstream timings and
   memory before/after. Do not merely raise gateway timeouts.

The local preview for this repair runs at `http://127.0.0.1:5058/site/`. An older
backend was already occupying 5057 and lacked newer assignment routes; leave it
out of comparisons. The isolated timing tests use randomly allocated ports and
were unaffected by that older preview.
