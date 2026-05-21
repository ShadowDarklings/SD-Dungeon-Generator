# SD Dungeon Generator — End-to-End Walk

**Team:** ShadowDarklings  
**Coordinator:** Charles

## 1. Definition

End-to-end for this project means exercising the full boundary from a
user's browser through the Flask application server, into the Postgres
database, and out to the external S3-hosted dungeon data tables. The
system under test spans: browser (`/site/` dungeon generator canvas and
`/register`, `/login`, `/runs` pages) to Flask route handlers to
SQLModel/Postgres persistence (7 tables with constraints, foreign keys,
and cascade deletes) to the external S3 static JSON endpoint at
`charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com`. A complete
e2e walk must verify that a user can register, authenticate via
Flask-Login, generate a dungeon using real S3-sourced monster and trap
tables, save the run to Postgres, reload it with full state restoration,
and be blocked from accessing another user's saved run by the OWASP
BOLA 404 rule. The walk also exercises the external API failure contract
(timeout, malformed JSON, rate-limit responses) to verify the proxy
returns correct 503 error envelopes.

## 2. The walk

### Setup

**Step 1.** Fresh environment: `docker compose down -v && docker compose up -d`.
Wait for health checks. Verify `pytest` passes against the clean database.

### Anonymous user flow

**Step 2.** Open `http://<host>:5000/` in a browser anonymously. Verify the
home page renders with navigation links to `/site/`, `/login`, `/register`,
and `/about`.

**Step 3.** Navigate to `/site/` anonymously. Verify the dungeon generator
canvas loads and is playable without login (read/play is public per
CONTRACTS.md section 4).

**Step 4.** Attempt to access `/runs` anonymously. Verify redirect to
`/login` or a 401 response.

### Registration and authentication

**Step 5.** Navigate to `/register`. Create user `testuser` with a password.
Verify 302 redirect to `/login`. Verify user row exists in Postgres:
`docker compose exec db psql -U app -d app -c "SELECT id, username FROM users WHERE username='testuser';"`.

**Step 6.** Log in as `testuser` at `/login`. Verify redirect to home.
Verify Flask-Login session is active (browser dev tools: cookie contains
`session` with `_user_id`).

### External API fetch (S3 random tables)

**Step 7.** `curl http://<host>:5000/api/random-tables?type=monsters&level=1` —
verify 200 response with `{"results": [...], "source": "http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-1.json", "error": null}`.
Confirm `results` is a non-empty JSON array of monster objects.

**Step 8.** `curl http://<host>:5000/api/random-tables?type=traps` — verify
200 response with trap data from `/traps.json`. Confirm results array
contains entries with trigger, effect, and DC fields.

**Step 9.** `curl http://<host>:5000/api/random-tables?type=monsters&level=2` —
verify 200 response pulling from `/monsters-2.json` (levels 2-10 map to
table 2 per CONTRACTS.md section 3).

**Step 10.** `curl http://<host>:5000/api/random-tables?type=potions` — verify
400 response with `{"error": "invalid_table"}`.

### Save and reload dungeon run

**Step 11.** As logged-in `testuser`, POST a dungeon run:
```bash
curl -b cookies.txt -X POST http://<host>:5000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"seed": 55555, "level": 2, "state_json": {"tiles": [{"x":0,"y":0,"type":"floor"}], "rooms": [{"key":"room_A","x":1,"y":1,"w":3,"h":3}], "halls": [], "entities": [], "player": {"x":1,"y":1}, "visibility": {}, "lootLog": [], "generation": {}}}'
```
Verify 201 response with `id`, `seed`, `level`, `created_at`,
`updated_at`, and `links.self`. Note the returned `id`.

**Step 12.** Verify persistence in Postgres:
`docker compose exec db psql -U app -d app -c "SELECT id, user_id, seed, level FROM saved_runs;"`.
Confirm the row exists with correct seed and level.

**Step 13.** GET the saved run:
`curl -b cookies.txt http://<host>:5000/api/runs/<id>` — verify 200 with
full `state_json` matching what was saved.

**Step 14.** PUT an updated state (simulate exploration):
```bash
curl -b cookies.txt -X PUT http://<host>:5000/api/runs/<id> \
  -H "Content-Type: application/json" \
  -d '{"state_json": {"tiles": [{"x":0,"y":0,"type":"floor"},{"x":1,"y":0,"type":"floor"}], "rooms": [{"key":"room_A","x":1,"y":1,"w":3,"h":3,"explored":true}], "halls": [], "entities": [{"key":"m1","kind":"monster","defeated":true}], "player": {"x":2,"y":1}, "visibility": {"room_A": true}, "lootLog": [{"name":"Gold Ring","value":10}], "generation": {}}}'
```
Verify 200 with newer `updated_at`.

### Security — OWASP BOLA 404 rule

**Step 15.** Register and log in as `bob`. Attempt to access `testuser`'s
run: `curl -b bob_cookies.txt http://<host>:5000/api/runs/<testuser_run_id>`.
Verify 404 (not 403). Repeat with PUT and DELETE — all must return 404.

### Cleanup

**Step 16.** As `testuser`, DELETE the run:
`curl -b cookies.txt -X DELETE http://<host>:5000/api/runs/<id>` — verify
204. Verify cascade: `SELECT count(*) FROM tiles WHERE saved_run_id=<id>;`
returns 0.

## 3. Pass criteria

- **Step 1**: `docker compose up -d` completes without errors; `pytest` reports all passing tests with exit code 0.
- **Step 2**: Home page returns 200; HTML contains nav links to `/site/`, `/login`, `/register`, `/about`.
- **Step 3**: `/site/` returns 200; dungeon canvas renders and is interactive without login.
- **Step 4**: `/runs` returns 302 redirect to `/login` or 401 JSON for anonymous users.
- **Step 5**: Registration returns 302 to `/login`; Postgres query returns exactly one row for `testuser`.
- **Step 6**: Login returns 302 to home; browser session cookie contains Flask-Login `_user_id` field.
- **Step 7**: Response is 200; `results` is a non-empty array; `source` URL matches CONTRACTS.md S3 base; `error` is null.
- **Step 8**: Response is 200; `results` array contains trap objects with `trigger`, `effect`, and `DC` fields.
- **Step 9**: Response is 200; `source` ends with `/monsters-2.json` confirming level-to-table mapping.
- **Step 10**: Response is 400; JSON body contains `"error": "invalid_table"`.
- **Step 11**: Response is 201; JSON body contains `id` (integer), `seed` (55555), `level` (2), `created_at`, `updated_at` (ISO timestamps), and `links.self` (string matching `/api/runs/<id>`).
- **Step 12**: Postgres query returns a row with matching `seed=55555` and `level=2` owned by `testuser`'s user ID.
- **Step 13**: Response is 200; `state_json` matches the payload from step 11 exactly.
- **Step 14**: Response is 200; `updated_at` is strictly later than the value from step 11; `state_json` reflects the updated exploration state.
- **Step 15**: All three requests (GET, PUT, DELETE) return 404 with `{"error": "not_found"}`. No 403 responses. Bob cannot determine whether the run ID exists.
- **Step 16**: DELETE returns 204 with empty body. Postgres tile count query returns 0, confirming CASCADE delete.

## 4. Execution log

**Final run date:** May 20, 2026  
**Environment:** EC2 (`54.191.130.99`), Docker Compose, Postgres 16, Python 3.12  
**Branch:** `main` (all three role branches merged: `mario-db-security`, `backend-proxy-megan`, `Front-End`)

| Step | Result | Notes |
|------|--------|-------|
| 1 | PASS | Docker environment healthy. **21/21 tests pass** on merged `main` against live Postgres. All role test files green. |
| 2 | PASS | Home page renders correctly with all nav links (`/site/`, `/login`, `/register`, `/about`). |
| 3 | PASS | Dungeon generator canvas loads and is playable anonymously. Save/Load UI controls visible (save-btn, load-btn, save-load-modal). |
| 4 | PASS | Anonymous `/runs` access returns 302 redirect to login. Anonymous `/api/runs` returns 401 JSON. |
| 5 | PASS | Registration flow works. User row confirmed in Postgres. |
| 6 | PASS | Flask-Login session active. `_user_id` present in session cookie. |
| 7 | PASS | Real S3 fetch returns monster data. Response shape matches contract. Verified against live `charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-1.json`. |
| 8 | PASS | Trap data fetched successfully from S3. Fields match contract. |
| 9 | PASS | Level 2 correctly maps to `/monsters-2.json`. |
| 10 | PASS | Invalid table type returns 400 with `{"error": "invalid_table"}`. |
| 11 | PASS | Run created with 201 via browser Save UI. All required fields present in response. Also verified via `curl`. |
| 12 | PASS | Row confirmed in Postgres with correct seed, level, and user ownership. |
| 13 | PASS | GET returns full state_json matching saved payload. Browser Load UI restores dungeon state correctly. |
| 14 | PASS | PUT updates state. `updated_at` is newer. Child table rows updated via `populate_child_tables`. |
| 15 | PASS | All three (GET/PUT/DELETE) return 404 for Bob accessing testuser's run. OWASP BOLA rule enforced. No 403 responses. |
| 16 | PASS | DELETE returns 204. CASCADE confirmed — zero child rows remain. |

### Finding 1 — Backend test URL mismatch (proxy test) — RESOLVED

**Symptom**: `test_backend_proxy_handles_upstream_timeout` fails with
`assert 'upstream_invalid' == 'timeout'`. The test appears to show the
proxy mishandling timeouts, but the actual route code handles them
correctly.

**Root cause**: The test file `test_backend_random_table_proxy.py` mocks
the URL `https://maximumminiatures-oss.s3.amazonaws.com/tables/level_1_monsters.json`,
but the actual implementation in `app.py` calls
`http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-1.json`
(matching CONTRACTS.md section 3). Because the mock URL doesn't match,
the `responses` library doesn't intercept the real request, which then
fails with a `ConnectionError` (not a `Timeout`), landing in the generic
exception handler and returning `upstream_invalid`.

**Resolution**: Megan updated the mock URLs in both test functions to
match the contracted S3 base URL. Both proxy tests now pass. Merged
in PR #3.

**Lesson**: This is exactly the kind of truthy-fixture gap the
assignment warns about. The mock URL was plausible but didn't match
the real contract, so the test was exercising a code path that would
never fire in production. Running the e2e walk against the real S3
endpoint (steps 7-9) confirmed the proxy works correctly.

### Finding 2 — Backend CRUD test uses wrong session key — RESOLVED

**Symptom**: `test_create_saved_run_endpoint_contract` fails with
`assert 401 == 201`. The test cannot authenticate.

**Root cause**: The test sets `session["user_id"]` (the old raw-session
pattern from Week 5), but the app now uses Flask-Login, which stores
the user ID under `session["_user_id"]`. The test was written before
the Flask-Login refactor landed.

**Resolution**: Megan updated the test fixture to create a real `User`
row in the database, then set `sess["_user_id"] = str(user_id)` with
`sess["_fresh"] = True`. Test now passes. Merged in PR #3.

**Lesson**: Cross-role contract boundaries matter. The security role
changed the auth mechanism (as contracted), but the backend test was
written against the old interface. This is a coordination gap that
would have been caught if the test had been updated after the
Flask-Login refactor merged.

### Finding 3 — Client-side integration not yet landed — RESOLVED

**Symptom**: No save/load UI controls existed in `/site/` during the
initial individual e2e walk.

**Root cause**: The client-side role work (Charles) had not been merged
to `main` yet.

**Resolution**: Charles merged his `Front-End` branch (PR #4) containing
the full save/load modal UI (`persistence.js`, `#save-btn`, `#load-btn`,
`#save-load-modal`), overwrite/replace confirmation panels, wandering
monsters, timers, and 3 frontend test cases. Steps 11-14 are now
verifiable through both `curl` and the browser Save/Load UI.

**Status**: Resolved. All UI controls functional.

### Finding 4 — Seed/level type coercion mismatch — RESOLVED

**Symptom**: Charles's client-side E2E walk found that `POST /api/runs`
returned 400 errors when saving dungeons from the browser. The Save/Load
UI was blocked.

**Root cause**: The `POST` and `PUT` `/api/runs` routes used
`isinstance(seed, int)` checks for input validation. JavaScript
`JSON.stringify()` can serialize numbers in ways that Python parses as
`float` (e.g., `123456.0`) or `str` (e.g., `"123456"`). Both fail the
strict `isinstance(x, int)` check, returning a 400 error.

**Resolution**: Mario replaced all four `isinstance` checks with
`int()` coercion wrapped in `try/except`. This accepts `int`, `float`,
and `str` representations of integers while still rejecting non-numeric
values. Pushed directly to `main` as a hotfix (`7c0fa9f`).

**Lesson**: When the client is JavaScript and the server is Python,
type boundaries at the JSON serialization layer need to be permissive.
Strict type checks should validate semantics ("is this a valid level?")
not representation ("is this a Python int?").

## 5. Per-role contributions

| Role | Contribution to this walk |
|------|--------------------------|
| Charles (Coordinator / Client-side) | Committed CONTRACTS.md and coord_session.md. Steps 2-3 (anonymous browsing). Implemented full save/load modal UI with persistence.js, wandering monsters, timers, overwrite/replace confirmations. 3 frontend tests (PR #4). Client-side e2e walk documented in `e2e/client.md`. |
| Megan (Server-side) | Steps 7-10 (S3 proxy verification). Implemented backend proxy route, aligned test fixtures to Flask-Login conventions and contracted S3 URL (PR #3). 2 proxy tests + 1 CRUD test. |
| Mario (DB & Security) | Steps 1, 4-6 (auth flow), 11-16 (save/load/update/delete lifecycle, BOLA ownership, CASCADE verification). Implemented all 7 DB tables, Flask-Login refactor, OWASP 404 rules, CRUD route handlers, and seed/level coercion hotfix. 5 schema tests + 3 ownership tests. Individual e2e walk documented in `e2e/db_security.md`. |

## 6. What we'd do differently next time

- Run the e2e walk earlier in the week as a team, not on the last day. Several findings (URL mismatch in tests, session key mismatch, seed type coercion) would have been caught with a single coordinated test run mid-week.
- Establish a shared test fixture helper that creates users and logs in via Flask-Login, so every role's tests use the same auth mechanism and don't drift when the auth layer changes.
- The coordinator should have merged the Flask-Login refactor to `main` before backend tests were finalized, so the test files could be written against the actual auth interface.
- Validate input coercion at the API boundary from day one. JavaScript and Python have different type semantics across JSON serialization; this should be anticipated in the contract rather than discovered during integration.
