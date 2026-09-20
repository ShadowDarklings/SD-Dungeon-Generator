# ShadowSpawner performance and outage audit

## Production status

The in-app browser reproduced `504 Gateway Time-out`, advertised by
`nginx/1.24.0 (Ubuntu)`, at `https://ctreeder.com/site/`. The portfolio homepage
rendered. This is a server/upstream failure, not evidence of inadequate client
bandwidth. The exact failure (stalled workers, memory pressure, database waits,
or incorrect proxy configuration) cannot be established without server logs.

Production has not been repaired or deployed as part of this audit yet. The
previously configured SSH key was rejected, and DigitalOcean sign-in is waiting
for the owner's Google verification. The live native Ubuntu nginx deployment
differs from the repository's Docker nginx configuration. Do not overwrite the
portfolio server configuration with the Docker template without inspecting it.

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

## Homepage link audit

All eight distinct local/fragment targets in the source exist. All twelve
distinct outgoing page URLs were probed. The live homepage's three text/logo
links already target `/site/`; its dungeon screenshot was not a link.

| Destination | Observed result |
| --- | --- |
| ShadowSpawner | Browser reproduced nginx 504 |
| World map | Browser rendered, after initial navigation delay |
| Illustration | Browser rendered, after initial navigation delay |
| Armstrong source | Browser rendered |
| MCC generator | Timed out; live route remains unverified |
| Five GitHub destinations | HTTP 200 |
| LinkedIn | Automated request rejected with 999; not proven broken |
| Dungeon-master booking | Automated request rejected with 406; not proven broken |

Command-line probes to ctreeder.com also timed out, including pages that later
rendered in the browser. They should not be treated as proof that every route is
broken. `scripts/audit_portfolio_links.py --live` records per-link results.

## Required production recovery

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
