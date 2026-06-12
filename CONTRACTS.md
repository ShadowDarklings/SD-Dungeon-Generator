# SD Dungeon Generator - CONTRACTS.md

**Team:** ShadowDarklings  
**Week:** Final Project  
**Project:** Procedural Shadowdark dungeon generator  
**Contract status:** Load-bearing. Change this document first, then tests, then code.

> **Week 10 note:** §§1–14 are unchanged from the Week 7 contract. Week 10 adds **§15 (Production Stack
> & Hardening)** at the end. The schema, endpoint contracts, and authorization rules do not change; §15
> records new infrastructure ownership and the one runtime behavior change (ProxyFix + Secure cookies
> now active over HTTPS).

> **Final Project note:** This revision (1) contracts the previously undocumented
> `POST /api/shadowdarklings/import` endpoint (§2, §3c), (2) revises the monster-table mapping now that
> per-level tables `monsters-1.json` … `monsters-10.json` exist (§3a — **code change required**, see
> §17), (3) marks the §15.5 CSP open item resolved and records the deployed policy, and (4) adds
> **§16 (Multiplayer Host Links)** — the contracted API for the invite-players feature whose frontend
> shipped in PR #17. §17 is the revision log with per-role action items. Source material for §16:
> `BACKEND_multiplayer_handoff.md` and `SECURITY_multiplayer_handoff.md` (now superseded by this
> contract where they conflict).

This document defines what the system does. It is not an implementation
plan. The back-end role builds the API described here, the front-end role
consumes it, and the database/security role verifies the schema and
authorization behavior. If this contract is wrong, update `CONTRACTS.md` and
the affected tests before changing application code.

Existing skeleton routes remain in place: `/`, `/site/`, `/site/<path>`,
`/register`, `/login`, `/logout`, and `/about`.

## 1. Schema

### Table: `users` (existing, modified in Week 7)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Autoincrement user id. |
| `username` | VARCHAR(80) | UNIQUE, NOT NULL, indexed | Login name. |
| `password_hash` | VARCHAR(255) | **nullable** (Week 7) | Werkzeug password hash. NULL for OAuth-only users. |
| `email` | VARCHAR(254) | UNIQUE when not null, nullable (Week 7) | From OAuth profile or manual entry. |
| `display_name` | VARCHAR(200) | nullable (Week 7) | From OAuth `name` field. Falls back to `login`. |
| `created_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Defaults to current time. |

Week 6 changed the auth integration to Flask-Login. Week 7 makes
`password_hash` nullable to support OAuth-only accounts and adds `email`
and `display_name` columns for OAuth profile data.

> **Breaking change (Week 7):** `password_hash` is now nullable. The password
> login route must check for `NULL` before calling `check_password_hash` and
> reject login attempts against OAuth-only accounts with a sensible flash
> message ("This account uses GitHub login").

### Table: `oauth_identities` (new, Week 7)

Links an external provider identity to a local `users` row.
One user may have multiple OAuth identities (e.g., GitHub today, Google later).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Autoincrement row id. |
| `user_id` | INTEGER | NOT NULL, FK to `users.id` ON DELETE CASCADE, indexed | Local user this identity belongs to. |
| `provider` | VARCHAR(50) | NOT NULL | Provider name, e.g. `"github"`. |
| `provider_user_id` | VARCHAR(200) | NOT NULL | The provider's unique user ID (GitHub `id` field, stored as string). |
| `provider_login` | VARCHAR(200) | NULL | Provider username (GitHub `login` field). Informational, not authoritative. |
| `created_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | When this identity was first linked. |

**UNIQUE constraint:** `(provider, provider_user_id)` — a given GitHub account
can only be linked once, to one local user.

### Table: `saved_runs` (new, Week 6)

The canonical save record for one generated dungeon run. The full serialized
runtime state is stored here so the client can restore a game exactly.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Autoincrement saved run id. |
| `user_id` | INTEGER | NOT NULL, FK to `users.id` ON DELETE CASCADE, indexed | Owner of the run. |
| `seed` | INTEGER | NOT NULL | Generator seed used by the client. |
| `level` | INTEGER | NOT NULL, CHECK `level BETWEEN 1 AND 10` | Dungeon level selected by the user. |
| `state_json` | JSON | NOT NULL | Serialized dungeon state from `docs/STATE_SCHEMA.md`. |
| `created_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | First save time. |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Last update time. |

### Table: `tiles` (new, Week 6)

Snapshot rows for the grid at save time. These support inspection and future
querying, but `saved_runs.state_json` remains the source used for load.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Autoincrement tile row id. |
| `saved_run_id` | INTEGER | NOT NULL, FK to `saved_runs.id` ON DELETE CASCADE, indexed | Parent run. |
| `x` | INTEGER | NOT NULL | Grid x coordinate. |
| `y` | INTEGER | NOT NULL | Grid y coordinate. |
| `type` | VARCHAR(20) | NOT NULL | `wall`, `floor`, `door`, or `void`. |
| `room_id` | VARCHAR(80) | NULL | Runtime room id if present. |
| `hall_id` | VARCHAR(80) | NULL | Runtime hall id if present. |

**UNIQUE constraint:** `(saved_run_id, x, y)`.

### Table: `rooms` (new, Week 6)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Database row id. |
| `saved_run_id` | INTEGER | NOT NULL, FK to `saved_runs.id` ON DELETE CASCADE, indexed | Parent run. |
| `room_key` | VARCHAR(80) | NOT NULL | Runtime room id from state. |
| `x` | INTEGER | NOT NULL | Room origin x. |
| `y` | INTEGER | NOT NULL | Room origin y. |
| `width` | INTEGER | NOT NULL | Room width in tiles. |
| `height` | INTEGER | NOT NULL | Room height in tiles. |
| `discovered` | BOOLEAN | NOT NULL, DEFAULT false | Whether the player has discovered it. |
| `explored` | BOOLEAN | NOT NULL, DEFAULT false | Whether the player has explored it. |

**UNIQUE constraint:** `(saved_run_id, room_key)`.

### Table: `halls` (new, Week 6)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Database row id. |
| `saved_run_id` | INTEGER | NOT NULL, FK to `saved_runs.id` ON DELETE CASCADE, indexed | Parent run. |
| `hall_key` | VARCHAR(80) | NOT NULL | Runtime hall id from state. |
| `from_room_id` | VARCHAR(80) | NULL | Runtime source room id. |
| `to_room_id` | VARCHAR(80) | NULL | Runtime destination room id. |

**UNIQUE constraint:** `(saved_run_id, hall_key)`.

### Table: `entities` (new, Week 6)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Database row id. |
| `saved_run_id` | INTEGER | NOT NULL, FK to `saved_runs.id` ON DELETE CASCADE, indexed | Parent run. |
| `entity_key` | VARCHAR(120) | NOT NULL | Runtime entity id. |
| `kind` | VARCHAR(30) | NOT NULL | `monster`, `treasure`, `trap`, or `feature`. |
| `name` | VARCHAR(200) | NULL | Display name. |
| `x` | INTEGER | NOT NULL | Grid x coordinate. |
| `y` | INTEGER | NOT NULL | Grid y coordinate. |
| `defeated` | BOOLEAN | NOT NULL, DEFAULT false | Monster state. |
| `collected` | BOOLEAN | NOT NULL, DEFAULT false | Treasure state. |
| `revealed` | BOOLEAN | NOT NULL, DEFAULT false | Trap state. |
| `triggered` | BOOLEAN | NOT NULL, DEFAULT false | Trap state. |
| `value` | INTEGER | NULL | Treasure value in gp. |

**UNIQUE constraint:** `(saved_run_id, entity_key)`.

### Table: `loot_entries` (new, Week 6)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Database row id. |
| `saved_run_id` | INTEGER | NOT NULL, FK to `saved_runs.id` ON DELETE CASCADE, indexed | Parent run. |
| `name` | VARCHAR(200) | NOT NULL | Loot display name. |
| `value` | INTEGER | NOT NULL, DEFAULT 0 | Value in gp. |
| `origin_tile` | JSON | NOT NULL | `{ "x": number, "y": number }`. |

## 2. Endpoint Contracts

All JSON responses use this error envelope when a request fails:

```json
{
  "error": "machine_readable_code",
  "message": "Human readable explanation."
}
```

### `GET /runs`

| Field | Contract |
|---|---|
| Purpose | Render the current user's saved dungeon runs page. |
| Auth | Required. Anonymous users are redirected to login or receive 401. |
| Request | No body. Optional query `limit`, integer 1-50, default 20. |
| Response | HTML page listing owned runs, newest updated first. Each run includes `id`, `seed`, `level`, `created_at`, `updated_at`, and a load/delete control. |
| Errors | 401 or 302 for anonymous access. |

### `POST /api/runs`

| Field | Contract |
|---|---|
| Purpose | Save a generated dungeon run for the logged-in user. |
| Auth | Required. |
| Request | JSON with `seed` integer, `level` integer 1-10, and `state_json` object matching `docs/STATE_SCHEMA.md`. |
| Success | HTTP 201 JSON: `{ "id", "seed", "level", "state_json", "created_at", "updated_at", "links": { "self": "/api/runs/<id>" } }`. |
| Errors | 400 `invalid_json`, 400 `invalid_level`, 400 `invalid_state`, 401 `login_required`. |
| CSRF | Exempt (JSON API, protected by `SameSite=Lax`; see §9.3). |

### `GET /api/runs`

| Field | Contract |
|---|---|
| Purpose | Return a JSON list of the current user's saved runs. |
| Auth | Required. |
| Request | No body. Optional query `limit`, integer 1-50, default 20. |
| Success | HTTP 200 JSON: `{ "results": [ { "id", "seed", "level", "created_at", "updated_at", "links" } ], "error": null }`. |
| Errors | 401 `login_required`. |

### `GET /api/runs/<run_id>`

| Field | Contract |
|---|---|
| Purpose | Load one owned dungeon run. |
| Auth | Required. |
| Request | No body. |
| Success | HTTP 200 JSON: `{ "id", "seed", "level", "state_json", "created_at", "updated_at" }`. |
| Errors | 401 `login_required`; 404 `not_found` if the run does not exist or belongs to another user. |

### `PUT /api/runs/<run_id>`

| Field | Contract |
|---|---|
| Purpose | Update an owned dungeon run after exploration changes. |
| Auth | Required. |
| Request | JSON with `state_json` object. `seed` and `level` may be included but must still match valid types and level range. |
| Success | HTTP 200 JSON with the same shape as `GET /api/runs/<run_id>`, with a newer `updated_at`. |
| Errors | 400 `invalid_json`, 400 `invalid_level`, 400 `invalid_state`, 401 `login_required`, 404 `not_found` for missing or not-owned runs. |
| CSRF | Exempt (JSON API, protected by `SameSite=Lax`; see §9.3). |

### `DELETE /api/runs/<run_id>`

| Field | Contract |
|---|---|
| Purpose | Delete an owned saved dungeon run. |
| Auth | Required. |
| Request | No body. |
| Success | HTTP 204 with no response body. |
| Errors | 401 `login_required`; 404 `not_found` for missing or not-owned runs. |
| CSRF | Exempt (JSON API, protected by `SameSite=Lax`; see §9.3). |

### `GET /api/random-tables`

| Field | Contract |
|---|---|
| Purpose | Server-side read of the dungeon data source used by the client. This is the Week 6 external-world route. |
| Auth | None required. |
| Request | Query params: `type` is `monsters` or `traps`; `level` is 1-10 and required for `monsters`. |
| Upstream | Uses `requests` to fetch the configured S3/static website JSON URL. |
| Success | HTTP 200 JSON: `{ "results": [...], "source": "<url>", "error": null }`. |
| Errors | 400 `invalid_table`, 400 `invalid_level`, 503 `timeout`, 503 `rate_limited`, 503 `upstream_invalid`. |

### `GET /login/github` (new, Week 7)

| Field | Contract |
|---|---|
| Purpose | Initiates the GitHub OAuth flow. Redirects the browser to GitHub's authorization page. |
| Auth | None required (the user is trying to log in). |
| Request | No body. No query params. |
| Response | HTTP 302 redirect to `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, `scope=user:email`, and a `state` parameter for CSRF protection. |
| Errors | None expected — this is a simple redirect. |

### `GET /auth/github/callback` (new, Week 7)

| Field | Contract |
|---|---|
| Purpose | Handles the return from GitHub after the user authorizes (or denies). |
| Auth | None required (GitHub is redirecting the user back). |
| Request | Query params from GitHub: `code` (authorization code) and `state` (CSRF token). |
| Processing | 1. Exchange `code` for an access token via `POST https://github.com/login/oauth/access_token`. 2. Use the token to fetch user info from `GET https://api.github.com/user`. 3. Execute the create-or-link logic (see §8). 4. Call `login_user()` on the resolved local user. 5. Redirect to the post-login landing page. |
| Success | HTTP 302 redirect to `/` (or `/runs` — team decides the landing page). |
| Errors | If `code` is missing or token exchange fails: flash error message, redirect to `/login`. If `state` doesn't match: flash "Authentication failed", redirect to `/login`. |

### `GET /test/login/<username>` (new, Week 7 — testing only)

| Field | Contract |
|---|---|
| Purpose | Logs in a named user without going through GitHub. Used by Playwright tests. |
| Guard | Returns 404 if `app.config["TESTING"]` is not set. Never available in production. |
| Behavior | Finds or creates a `User` with `email=<username>@test`, `display_name=<username>`, `password_hash=NULL`. Calls `login_user(user)`. Redirects to `/`. |
| Creates `oauth_identities` row? | No — the backdoor simulates a logged-in state, not an OAuth flow. This is the documented gap. |

### `POST /api/shadowdarklings/import` (contracted Final Project; shipped earlier without contract)

| Field | Contract |
|---|---|
| Purpose | Generate a random Shadowdark character by driving the live shadowdarklings.net site (§3c) and return its exported JSON to the client. |
| Auth | **Required.** The endpoint launches a server-side headless browser; anonymous access would be a trivial resource-exhaustion vector. 401 `login_required` for anonymous callers. |
| Request | Optional JSON body: `{ "base_classes_only": boolean }` (default `false`). When `true`, the optional ShadowDarklings source switches (§3c) are disabled before generating. Missing/invalid body is treated as `{}`. |
| Success | HTTP 200 JSON: `{ "source": "shadowdarklings", "character_json": "<exported JSON string>", "generated_at": "<ISO timestamp>" }`. |
| Errors | 401 `login_required`; 503 `feature_disabled` when the feature is off (see Environments); 503 `shadowdarklings_service_unavailable` when the upstream site or browser automation fails (revised from 502 `shadowdarklings_import_failed` in PR #19 — 503 better reflects a transient upstream outage; clients distinguish the two 503s by `error` code). |
| CSRF | Exempt (JSON API, protected by `SameSite=Lax`; see §9.3). |
| Environments | Enabled by default outside production. Production deployments must explicitly set `SHADOWDARKLINGS_IMPORT_ENABLED=1`; otherwise the endpoint returns 503 `feature_disabled`. The production image ships Playwright Chromium so EC2 full-site deployments can enable importer support. |
| Known limitation | Synchronous and slow (real browser per request). One request at a time per user is the intended usage; no queueing exists. |

## 3. External API Contracts

### 3a. S3 Dungeon Tables (Week 6)

The project's data source is the team's static dungeon content hosted on AWS S3
static website hosting, also mirrored locally through Flask at `/site/`.

| Item | Contract |
|---|---|
| Base URL | `http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com` |
| Monster tables | **Revised (Final Project):** `/monsters-1.json` … `/monsters-10.json` — one table per dungeon level, level N maps to `monsters-N.json`. The client already does this (`loadMonsterTableForLevel` clamps to 1-10 and fetches `./monsters-N.json` from `/site/`). The `/api/random-tables` proxy still implements the old Week 6 mapping (2-10 → table 2) and **must be updated to match** (§17). The Week 6 two-table mapping is retired. |
| Table sync | The per-level JSON files are committed in `S3_content/` and served at `/site/`. Whoever changes them must re-publish to the S3 bucket (`scripts/s3_sync_publish.py`) — the proxy reads the *bucket*, the game reads `/site/`, and the two must not drift. |
| Trap table | `/traps.json` |
| Auth | None. These are public static JSON assets. |
| Rate limits | S3 has service limits and free-tier usage limits, but no application key. The app should make one request per table load and should not poll repeatedly. |
| Success shape | JSON arrays. Monster entries include display/stat fields used by the client. Trap entries include trigger, effect, and DC fields used by trap rendering and disarm checks. |
| Timeout | Treat request timeout as HTTP 503 `{ "error": "timeout", "results": [], "message": "Dungeon table temporarily unavailable." }`. |
| Rate-limit or throttling | Treat 429 or AWS throttling-style responses as HTTP 503 `{ "error": "rate_limited", "results": [], "message": "Dungeon table temporarily unavailable." }`. |
| Malformed JSON or wrong shape | Treat as HTTP 503 `{ "error": "upstream_invalid", "results": [], "message": "Dungeon table response was not usable." }`. |

The client may still load local `/site/*.json` files directly for gameplay.
The back-end route exists so CI and e2e can verify the external-world contract
with deterministic failure handling.

### 3b. GitHub OAuth Provider (Week 7)

**external_dependency: github.com**

GitHub's actual behavior is not in our repo and cannot be contracted. We
specify what our code does with the response, not what the response will be.

| Item | Contract |
|---|---|
| Authorization URL | `https://github.com/login/oauth/authorize` |
| Token exchange URL | `https://github.com/login/oauth/access_token` |
| User info URL | `https://api.github.com/user` |
| Scope requested | `user:email` |
| Auth | OAuth app credentials (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`) loaded from `.env`. |

Representative payload shape from `GET https://api.github.com/user`:

```json
{
  "id": 123456,
  "login": "octocat",
  "email": "octocat@github.com",
  "name": "The Octocat",
  "avatar_url": "https://avatars.githubusercontent.com/u/123456"
}
```

**Missing-field handling:**
- `email` is `null` → set `email = NULL` on the user record (acceptable; they can add one later).
- `name` is `null` → set `display_name` to the GitHub `login` value instead.
- `login` is never null in GitHub's API — safe as a fallback.

### 3c. ShadowDarklings Character Generator (contracted Final Project)

**external_dependency: shadowdarklings.net**

The `POST /api/shadowdarklings/import` endpoint (§2) drives the live site
`https://shadowdarklings.net/create` with a server-side headless browser
(Playwright) and copies the site's JSON export. As with GitHub (§3b), we
contract what our code does, not what the site will do.

| Item | Contract |
|---|---|
| URL | `https://shadowdarklings.net/create` |
| Auth | None — public site. |
| Automation steps | Click "Random 1" → "Best Fit" → set source switches → "Generate a Random Character" → "JSON" → read clipboard. |
| Source switches | `Scroll #1-4`, `B&R&K`, `Roustabout`, `Unnatural Selection`, `Darcy`. All enabled by default; all disabled when `base_classes_only=true`. Switches the site has disabled are skipped without error. |
| Failure handling | Any automation or upstream failure → HTTP 503 `shadowdarklings_service_unavailable` with a generic retry-later message (no raw exception text leaks to clients). No retries. |
| Fragility | This is UI-scraping: any shadowdarklings.net redesign breaks it. Acceptable for a bonus feature; the dungeon game must function fully without it. |

## 4. Authorization Rules

| Resource | Anonymous user | Logged-in owner | Logged-in non-owner |
|---|---|---|---|
| `/site/` dungeon generator | Read/play allowed | Read/play allowed | Read/play allowed |
| `GET /runs` | 302 to login or 401 | Can list own runs | Can list only own runs |
| `POST /api/runs` | 401 or 302 | Can create own run | Can create only own run |
| `GET /api/runs/<run_id>` | 401 or 302 | Can read own run | 404, not 403 |
| `PUT /api/runs/<run_id>` | 401 or 302 | Can update own run | 404, not 403 |
| `DELETE /api/runs/<run_id>` | 401 or 302 | Can delete own run | 404, not 403 |
| `GET /api/random-tables` | Read allowed | Read allowed | Read allowed |
| `POST /api/shadowdarklings/import` | 401 | Allowed | Allowed (not ownership-scoped) |
| `GET /login/github` | Initiates OAuth flow | Initiates OAuth flow (re-auth) | — |
| `GET /auth/github/callback` | Processes callback | Processes callback | — |
| `GET /test/login/<username>` | 404 (unless `TESTING`) | 404 (unless `TESTING`) | — |
| `/api/multiplayer/*` (§16) | 401 | Per §16.4 role rules (host vs. player vs. non-member) | Per §16.4 |

Ownership-restricted resources must use the OWASP-style 404-for-not-yours
rule. A user must not be able to learn whether another user's saved run exists.

## 5. Role Boundaries And Role-Specific Guides

### Front end (Charles)

**Builds this week (Week 6)**

- Save/load controls in `S3_content/index.html` and related client assets.
- JavaScript that serializes the current dungeon state into the `POST /api/runs`
  request shape.
- JavaScript that loads `GET /api/runs/<run_id>` responses back into playable
  state.
- User-facing empty, success, and failure states for saving and loading.

**Builds this week (Week 7)**

- "Sign in with GitHub" button on the login page (keep the password form
  alongside — don't delete it).
- Post-login UX: deliberate landing page after OAuth login.
- "Remember me" toggle wired to the session lifetime config.
- Logout button that clears state and lands on a sensible page.

**Owns**

- `S3_content/index.html`
- `S3_content/styles.css`
- `S3_content/src/*.js` when the change is UI behavior or client state
- Login/register/base templates
- Front-end tests such as `tests/test_frontend_saved_runs_ui.py` and
  `tests/test_frontend_state_contract.py`
- `tests/e2e/test_coordinator_smoke.py`

**Does not touch without team agreement**

- SQLModel schema definitions.
- Flask-Login setup.
- Server route authorization logic.
- `CONTRACTS.md` except through a contract revision PR.

### Back end (Megan)

**Builds this week (Week 6)**

- `GET /runs`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/<run_id>`
- `PUT /api/runs/<run_id>`
- `DELETE /api/runs/<run_id>`
- `GET /api/random-tables`
- Request/response validation and JSON error envelopes from this contract.

**Builds this week (Week 7)**

- Authlib with GitHub provider wiring.
- `/login/github` and `/auth/github/callback` routes (§2).
- Create-or-link logic (§8).
- `python-dotenv` / `load_dotenv()` setup — `load_dotenv()` called before
  any `os.environ` lookups.
- All secrets read with `os.environ["KEY"]` (brackets, not `.get()`) — missing
  secret crashes on startup.
- Handle missing/null provider fields → sensible defaults (never crash on
  partial payload).

**Owns**

- Flask route handlers in `app.py` or an agreed routes module.
- `requests` call to the S3/static JSON upstream.
- OAuth route handlers.
- Provider field mapping / default logic.
- Back-end tests such as `tests/test_backend_runs_api.py`,
  `tests/test_backend_run_lifecycle.py`, and
  `tests/test_backend_random_table_proxy.py`.
- `tests/e2e/test_server_login.py`

**Does not touch without team agreement**

- Client rendering and canvas gameplay logic.
- Password hashing or Flask-Login configuration.
- Database schema beyond what is needed to consume the security role's models.

### Database / security (Mario)

**Builds this week (Week 6)**

- SQLModel models for the schema in section 1.
- Flask-Login setup: `LoginManager`, user loader, `login_user`,
  `logout_user`, `current_user`, and `@login_required`.
- Ownership checks that return 404 for not-owned runs.
- Database-level constraints: foreign keys, unique constraints, level check,
  cascade deletes.

**Builds this week (Week 7)**

- `oauth_identities` SQLModel table (§1).
- `users` table schema update: nullable `password_hash`, add `email` +
  `display_name` (§1).
- Cookie flag configuration (§9.1).
- `PERMANENT_SESSION_LIFETIME` and remember-me config (§9.2).
- Flask-WTF CSRF wiring (§9.3).
- Playwright test: protected page access control (login/logout cycle).

**Owns**

- SQLModel model definitions in `app.py` or an agreed models module.
- Auth/session refactor in Flask.
- Session hardening configuration.
- CSRF setup.
- Security tests such as `tests/test_security_schema_and_login.py` and
  `tests/test_security_run_ownership.py`.
- `tests/e2e/test_security_access.py`

**Does not touch without team agreement**

- Client UI implementation.
- External JSON parsing behavior beyond the security implications of inputs.
- Endpoint response shapes except to enforce this contract.

### Coordinator (Charles)

**Builds this week (Week 6)**

- Keeps `CONTRACTS.md`, `coord_session.md`, and the four official failing test
  files aligned.
- Owns contract revisions when tests expose a bad agreement.
- Composes the whole-system e2e walk with role input.

**Builds this week (Week 7)**

- Drives contracts revision session, produces `coord_session.md`.
- Maintains integration log — tracks when changes break contracts.
- Sets up the test-login backdoor route `/test/login/<username>`.
- Sets up `tests/e2e/conftest.py` (`TESTING=True`, SQLite test DB, live server).
- Sets up GitHub OAuth app credentials, documents in `.env.example`.
- Playwright smoke test.

**Owns**

- `CONTRACTS.md`
- `coord_session.md`
- `e2e.md`
- `tests/test_integration.py`
- `tests/e2e/conftest.py`
- `tests/e2e/test_coordinator_smoke.py`

## 6. Known Limitations (Deliberate, Week 6)

- Higher-level dungeon monster tables are not complete. Week 6 maps levels 2-10
  to the available higher table rather than implementing every level-specific
  Shadowdark table.
- Multi-character dungeons are out of scope. A saved run tracks one player
  position and one inventory/loot log.
- More Shadowdark rules are out of scope this week, including initiative,
  stealth, open-lock rolls, disarm-trap rule depth beyond the current simple
  DC check, and full combat resolution.
- Torch timer rules are out of scope. The torch can be toggled, but elapsed
  real-time or turn-count burn-down is not contracted for Week 6.
- Animations and expanded art resources are out of scope, including custom
  tokens for different monsters, traps, treasure, and room features.
- Save conflict resolution is out of scope. Last write wins for `PUT`.
- Pagination beyond the `limit` query is out of scope.

## 7. E2E Walk Anchor (Week 6)

The whole-system e2e should prove this boundary:

Browser `/site/` -> Flask save/load API -> Postgres saved run rows -> S3/static
JSON dungeon tables.

At minimum, the team walk should register a user, generate a dungeon with a
real seed and level, hit the real static JSON table source at least once, save
the run, reload it, update exploration or loot state, verify persistence in
Postgres, and verify a second user receives 404 for the first user's run.

## 8. OAuth Create-or-Link Logic (Week 7)

When the `/auth/github/callback` receives a valid GitHub identity
(`provider="github"`, `provider_user_id=<github_id>`), the server-side code
follows this decision tree:

```
1. SELECT from oauth_identities WHERE provider="github" AND provider_user_id=<github_id>
   ├─ FOUND → Load the linked local user → login_user(user) → done (returning user)
   └─ NOT FOUND →
       2. Does a local user exist with matching email?
          ├─ YES → Create oauth_identities row linking this GitHub ID to existing user
          │        → login_user(user) → done (existing user adds GitHub)
          └─ NO  → Create new User (password_hash=NULL, email from GitHub, display_name from GitHub)
                   → Create oauth_identities row
                   → login_user(user) → done (first-time OAuth user)
```

**Username generation for new OAuth users:** use `github_<github_login>` to
avoid collisions with existing password-registered usernames. The `display_name`
field is what's shown in the UI.

**Auto-linking on email match** is appropriate for this project's scope. In
production you'd verify email ownership before linking (confirmation email).

## 9. Session Hardening (Week 7)

### 9.1 Cookie Flags

Set in `app.config` at startup:

```python
app.config["SESSION_COOKIE_SECURE"]   = True   # HTTPS only
app.config["SESSION_COOKIE_HTTPONLY"]  = True   # no JS access
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"  # CSRF mitigation
```

> **Note:** `SESSION_COOKIE_SECURE = True` means cookies won't be sent over
> plain HTTP. For local development over `http://localhost` and for Playwright
> test fixtures, set `SESSION_COOKIE_SECURE = False`.

### 9.2 Session Lifetime

```python
from datetime import timedelta

app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)
app.config["REMEMBER_COOKIE_DURATION"]   = timedelta(days=14)
```

- All sessions are marked permanent (`session.permanent = True` after login).
- Without "remember me": session expires after `PERMANENT_SESSION_LIFETIME`
  (2 hours).
- With "remember me": Flask-Login sets a `remember_token` cookie lasting
  `REMEMBER_COOKIE_DURATION` (14 days).

### 9.3 CSRF Protection (Flask-WTF)

```python
from flask_wtf.csrf import CSRFProtect
csrf = CSRFProtect(app)
```

**HTML forms** — CSRF tokens are required on every state-changing form:
- Login, register, logout forms must include `{{ csrf_token() }}` or
  `<input type="hidden" name="csrf_token" value="{{ csrf_token() }}">`.
- A `POST` without a valid CSRF token returns **400** with the standard error
  envelope:
  ```json
  { "error": "csrf_invalid", "message": "CSRF validation failed." }
  ```

**JSON API routes (`/api/*`)** — exempted from Flask-WTF CSRF via `@csrf.exempt`:
- These routes only accept `Content-Type: application/json`. Browsers cannot
  send JSON payloads from a cross-origin `<form>` submission, so the
  traditional CSRF vector does not apply.
- `SameSite=Lax` on the session cookie (§9.1) prevents cross-origin cookie
  attachment on POST requests in all modern browsers.
- No `X-CSRFToken` header is required on API calls.

> **Design rationale:** `SameSite=Lax` + JSON-only content type provides
> sufficient CSRF protection for same-origin API calls. In a production app
> at scale you'd add `X-CSRFToken` headers as defense-in-depth, but for this
> project the two existing layers are correct and sufficient.

## 10. Session State After Successful Login (Week 7)

Immediately after a successful `/auth/github/callback` or password login:

**Flask session dict contains:**

| Key | Value | Set by |
|---|---|---|
| `_user_id` | `str(user.id)` | Flask-Login (`login_user()`) |
| `_fresh` | `True` | Flask-Login |

The application code does **not** manually set `session["user_id"]` — Flask-Login
manages session state exclusively via `_user_id`. The legacy `session["user_id"]`
pattern from Week 5/6 is removed.

**Cookies set on the response:**

| Cookie | Flags |
|---|---|
| `session` (Flask session cookie) | `Secure` (prod only), `HttpOnly`, `SameSite=Lax` |
| `remember_token` (if "remember me" is checked) | `Secure` (prod only), `HttpOnly`, `SameSite=Lax` |

## 11. Logout Behavior (Week 7)

**What we clear locally:**
- Call `logout_user()` — clears `_user_id` from the Flask session and removes
  any `remember_token` cookie.
- The Flask session cookie is invalidated server-side.
- Redirect to `/` or `/login`.

**What we do NOT clear at the provider:**
- We do **not** revoke the GitHub OAuth token.
- We do **not** redirect to `https://github.com/logout`.
- The user remains logged into GitHub in their browser. This is standard —
  local logout only controls our app's session.

**Route:** The existing `POST /logout` route stays. Behavior is identical for
password-authenticated and OAuth-authenticated users — `logout_user()` handles
both.

## 12. Secrets Management (Week 7)

| File | Purpose | Committed? |
|---|---|---|
| `.env` | Holds `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `SECRET_KEY`, `DATABASE_URL` | **Never** (in `.gitignore`) |
| `.env.example` | Documents variable names with placeholder values | Yes |

- `load_dotenv()` is called at the top of `app.py` before any `os.environ`
  lookups.
- All secrets use `os.environ["KEY"]` (square brackets, not `.get()`) — a
  missing secret crashes the app on startup.
- `python-dotenv` is listed in `requirements.txt`.

## 13. Known Limitations (Week 7)

- **GitHub redirect is not tested automatically.** The test-login backdoor
  stands in for everything after `authorize_redirect`. The real redirect is
  verified manually once when wiring it up.
- **SQLite vs. Postgres gap in tests.** Playwright test fixtures use SQLite
  (`/tmp/*.sqlite`). Postgres-specific behaviors (JSON ops, constraint
  semantics, transaction isolation) are not exercised by the e2e suite.
- **Token revocation is not implemented.** Logout clears local state only.
  The GitHub OAuth token remains valid until it expires or the user revokes
  it on GitHub.
- **Google OAuth is not implemented.** The `oauth_identities` table supports
  multiple providers, but only GitHub is wired for Week 7.
- **Email verification is not implemented.** Auto-linking on email match
  trusts the provider's reported email. Production would verify email
  ownership before linking.
- **`SESSION_COOKIE_SECURE` is disabled in dev/test.** The test live server
  and local `docker compose up` run over HTTP, not HTTPS.

## 14. E2E Walk Anchor (Week 7)

The Week 7 whole-system e2e proves this additional boundary:

Browser → "Sign in with GitHub" button → GitHub OAuth (manual) or test-login
backdoor (automated) → Flask session with `_user_id` → protected pages
accessible → logout → protected pages blocked.

At minimum, the Playwright suite (`tests/e2e/test_full_lifecycle.py`) must
verify:

1. **First-time OAuth login** — new user via backdoor, lands on post-login
   page, `oauth_identity` row exists.
2. **Returning OAuth login** — same user logs out and back in, existing
   `oauth_identity` row reused (not duplicated).
3. **CSRF protection works** — tokenless POST to a state-changing form endpoint
   is rejected.
4. **Session expires** — with a short test-only `PERMANENT_SESSION_LIFETIME`,
   protected page becomes inaccessible after the lifetime passes.

## 15. Production Stack & Hardening (Week 10)

This section extends the contract for the Week 10 hardening work. It does **not** change the schema
(§1), endpoint contracts (§2), or authorization rules (§4). The application's behavior is unchanged;
Week 10 wraps it in a production stack — **nginx → gunicorn → Flask → Postgres** — over HTTPS, and
records the new ownership boundaries plus the one runtime behavior change that follows from running
behind a TLS-terminating proxy.

### 15.1 Stack components and where each config lives

| Component | File | Owner | Study Guide |
|---|---|---|---|
| Reverse proxy, TLS termination, headers, rate limits | `nginx/nginx.conf` (+ `nginx/proxy_params.conf`) | DB/sec (Mario) | §4 |
| WSGI server config | `gunicorn.conf.py` | Back end (Megan) | §5 |
| Three-container stack (nginx + app + db) | `docker-compose.yml` | DB/sec (Mario) | §6 |
| App image / entry point | `Dockerfile` | Back end (Megan) | §7 |
| Self-signed cert (generated, gitignored) | `nginx/certs/{cert,key}.pem` | DB/sec (Mario) | §7 |
| Attack-path test | `tests/test_attack_paths.py` + `attack_paths.json` | DB/sec (Mario) | §10 |

**Done means:** `docker-compose up` from `main` brings up nginx, the app under gunicorn, and Postgres;
`https://localhost` reaches the Flask app through nginx → gunicorn. The Week 5 `python app.py` /
two-container skeleton is retired as the production path (it may remain for local debugging).

### 15.2 Application entry point and WSGI server

- gunicorn imports the **module-level app object**: `gunicorn -c gunicorn.conf.py app:app`. There is no
  app factory; `create_app()` does not exist. The `Dockerfile` `CMD` uses the same target.
- gunicorn binds the unix socket `unix:/tmp/gunicorn.sock`, shared with nginx via the `gunicorn-socket`
  volume. The app container no longer publishes port 5000, and the dev `.:/app` bind-mount is dropped
  from the production path.
- **`preload_app` decision (pending — back end):** `app.py` calls `create_engine(DATABASE_URL)` at
  import time. With `preload_app = True` the engine is created before workers fork and must be disposed
  per worker in a `post_fork` hook (`engine.dispose()`); otherwise set `preload_app = False`. One must
  be chosen — see plan §10 / coord log.
- `app.run(debug=True)` remains only under `if __name__ == "__main__"` and is never the production path.

### 15.3 ProxyFix and forwarded headers (new)

nginx terminates TLS and forwards plain HTTP to gunicorn, so Flask must trust nginx's
`X-Forwarded-Proto` to know the original request was HTTPS:

```python
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
```

One proxy in the chain (nginx) → all args `= 1`. Without ProxyFix, `request.is_secure` is `False`,
`url_for()` emits `http://`, and `SESSION_COOKIE_SECURE=True` refuses to set the session cookie. This is
a Flask concern, not an nginx concern.

### 15.4 Cookie flags activated over HTTPS (supersedes the §9.1 dev note)

The Week 7 cookie flags (§9.1) were inert on `http://localhost`. With self-signed HTTPS and ProxyFix in
place, `SESSION_COOKIE_SECURE` is now active:

- `SESSION_COOKIE_SECURE` is `True` when `FLASK_ENV=production`, which the `app` service sets in
  `docker-compose.yml`. The session and remember-me cookies are then sent only over HTTPS.
- The §9.1 note ("for local development over `http://localhost` … set `SESSION_COOKIE_SECURE = False`")
  and the §13 limitation ("`SESSION_COOKIE_SECURE` is disabled in dev/test") now apply **only** to the
  Playwright e2e fixtures and any deliberate plain-HTTP local run — not to the docker-compose stack.

### 15.5 Security headers and CSP (set in nginx, not Flask) — RESOLVED

Response security headers are set at nginx: `Strict-Transport-Security`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geolocation/
payment all denied), and the `Content-Security-Policy` below.

The former open item is **resolved**: the inline delete-handler in `runs.html` moved to
`static/js/runs.js`, and `about.html`'s inline `<style>` moved to `about.css`. No inline scripts,
inline styles, or inline event handlers remain anywhere served by nginx.

Deployed policy:

```
default-src 'self'; script-src 'self';
style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- `https://cdn.jsdelivr.net` in `style-src` is for the Bootstrap CSS link in `templates/base.html`.
- `'unsafe-inline'` in `style-src` was added for `about.html`'s former inline `<style>` block. That
  block is now externalized, so the exception is **no longer needed and should be dropped** (§17).
- `script-src` is strictly `'self'` — keep it that way. New JS goes in `static/js/` or
  `S3_content/src/`, never inline in templates or HTML.

### 15.6 Static assets served by nginx

nginx serves static assets directly, out of Flask's hands:

- `/static/` → `location /static/` (the existing Flask static dir).
- `/site/` → the dungeon frontend in `S3_content/`. Previously served by Flask's `/site/` route; under
  the stack nginx serves it via a `location /site/` alias with the directory mounted into the nginx
  container. The Flask `/site/` route remains available for local debugging.

### 15.7 Rate limiting on auth endpoints (nginx)

nginx rate-limits authentication endpoints via `limit_req_zone` (§12). Applied to `/login`, `/register`,
and `/login/github` at a starting rate of **5 r/m, `burst=3 nodelay`**. `/auth/github/callback` is
**not** rate-limited — throttling the OAuth return risks failing legitimate logins (it is hit once per
real login as part of the provider round-trip).

### 15.8 The trust boundary (database)

The `db` service has **no `ports:`** declaration — Postgres is reachable only from other services on the
docker network, never from the host or public internet (§13). This protects against direct external DB
access, accidental connection-string leaks from client code, and lateral movement from another
compromised network. It does **not** protect against SQL injection, a compromised app container, or
anyone with host shell access. DB-layer responsibilities that remain ours: parametrized queries
(SQLModel handles this), the ownership-404 rule (§4), cascade deletes / unique constraints / the
`level BETWEEN 1 AND 10` check (§1), and — a **known limitation** — the app currently connects as the
Postgres superuser `app` rather than a least-privilege role.

### 15.9 Deploy pipeline (intended, not yet built)

Week 9 was a presentation; **no CI/CD release pipeline exists**. The only workflow is
`.github/workflows/test.yml` (pytest). The *intended* pipeline (documented in `DEPLOY_AWS.md`,
study guide §15–§17) is **tag-driven** (`on: push: tags: ['v*']`): build an image, push to a registry,
deploy to EC2 over SSH. Secrets (`OAUTH_CLIENT_SECRET`, an EC2 SSH key, a Docker Hub token) live in
three places only — generated at the provider, stored in GitHub Actions secrets / a gitignored `.env`,
used at runtime via `os.environ[...]`. This subsection documents intent for the Part C role writeups;
building the workflow is **out of scope** for Week 10.

### 15.10 Hardening-layer role boundaries (extends §5)

| Role | Week 10 hardening ownership |
|---|---|
| Front end (Charles) | nginx security headers + CSP; moving `/static/` and `/site/` to nginx; verifying the Secure-cookie behavior from the browser |
| Back end (Megan) | `gunicorn.conf.py`; `Dockerfile` production entry point (`app:app`); `ProxyFix`; the `preload_app`/engine decision; Flask production config (debug off, error handlers, secret handling) |
| DB / security (Mario) | `nginx.conf` server block (reverse proxy, rate limits, request filtering); `docker-compose.yml` 3-container wiring; self-signed cert generation; `attack_paths.json` + `test_attack_paths.py`; the db trust boundary; deploy/secrets (intended) |

### 15.11 Known limitations (Week 10)

- Self-signed cert only on the dev/test EC2 (`54.191.130.99`, Mario's instance); real certs
  (Let's Encrypt / Certbot) are out of scope for this instance. **For the graded submission
  deployment:** the public TLS certificate and any DNS setup belong to whichever team member
  provides the production EC2 that the instructor visits. If a self-signed cert is used for
  submission, the team must document the browser-warning tradeoff in the README.
- No CI/CD deploy is built; the release pipeline is documented as **intended** only.
- The app connects to Postgres as the superuser `app`, not a least-privilege role.
- `attack_paths.json` is a known-bad-string list (20 paths), not a structural audit. The companion
  `test_flask_never_saw_any_of_them` assertion is **skipped** unless gunicorn writes `logs/flask.log`
  (current config logs to stdout).
- Playwright e2e runs over HTTP + SQLite with `SESSION_COOKIE_SECURE=False`; it does not exercise the
  HTTPS Secure-cookie path unless pointed at `https://localhost` with `ignore_https_errors=true`.

## 16. Multiplayer Host Links (Final Project)

**Status:** Frontend shipped (PR #17): invite modal, `S3_content/src/multiplayer.js` API client,
DOM-structure test. **Backend does not exist yet.** The client degrades gracefully ("Multiplayer
backend is not connected yet."). This section is the contract the backend is built against; it
supersedes the two handoff documents where they conflict.

### 16.1 Schema

#### Table: `multiplayer_sessions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Autoincrement session id. **Never exposed as the invite code.** |
| `host_user_id` | INTEGER | NOT NULL, FK to `users.id` ON DELETE CASCADE, indexed | Session creator. |
| `invite_code` | VARCHAR(43) | UNIQUE, NOT NULL, indexed | URL-safe, cryptographically random (§16.3). |
| `seed` | INTEGER | NOT NULL | Generator seed. |
| `level` | INTEGER | NOT NULL, CHECK `level BETWEEN 1 AND 10` | Dungeon level. |
| `state_json` | JSON | NOT NULL | Serialized dungeon state (`docs/STATE_SCHEMA.md`), same format as `saved_runs`. |
| `created_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Last state change. |
| `closed_at` | TIMESTAMP WITH TIME ZONE | NULL | Set when the host closes the session; closed sessions reject join/assign. |

#### Table: `multiplayer_players`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Row id; this is the `player_id` used in API payloads. |
| `session_id` | INTEGER | NOT NULL, FK to `multiplayer_sessions.id` ON DELETE CASCADE, indexed | Parent session. |
| `user_id` | INTEGER | NOT NULL, FK to `users.id` ON DELETE CASCADE, indexed | Local account. |
| `display_name` | VARCHAR(200) | NOT NULL | Shown to other players; defaults to the user's `display_name` or `username`. |
| `role` | VARCHAR(10) | NOT NULL | `host` or `player`. |
| `assigned_character_id` | VARCHAR(120) | NULL | Runtime character/dot id from `state_json`. |
| `joined_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | First join. |
| `last_seen_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Updated on any authenticated session fetch. |

**UNIQUE constraint:** `(session_id, user_id)` — joining twice returns the existing membership
(idempotent join), it does not create a duplicate row.

A `multiplayer_events` audit table is deferred until real-time sync is built (§16.7).

### 16.2 Endpoint Contracts

All endpoints: auth **required** (401 `login_required` JSON envelope for anonymous), JSON only,
CSRF-exempt under the §9.3 rationale (`SameSite=Lax` + JSON content type), standard §2 error envelope.

**Common response shape** (`SessionView`) returned by create/join/get:

```json
{
  "id": 1,
  "invite_code": "kZx7…",
  "invite_url": "<origin>/site/?session=kZx7…",
  "role": "host" | "player",
  "players": [ { "id": 3, "display_name": "Alice", "role": "host", "assigned_character_id": "char-1" } ],
  "assignments": [ { "player_id": 3, "character_id": "char-1" } ],
  "state_json": { … },
  "error": null
}
```

`role` is the *requesting user's* role. `players[].id` is the `multiplayer_players.id`, never
`users.id`. No email, OAuth ids, password fields, or other users' saved runs ever appear (§16.5).

#### `POST /api/multiplayer/sessions`

| Field | Contract |
|---|---|
| Purpose | Create a session with the caller as host. |
| Request | JSON: `seed` int, `level` int 1-10, `host_character_id` string or null, `state_json` object. |
| Success | 201 `SessionView` (role `host`, caller in `players`). |
| Errors | 400 `invalid_json` / `invalid_level` / `invalid_state`, 401. |

#### `POST /api/multiplayer/sessions/<invite_code>/join`

| Field | Contract |
|---|---|
| Purpose | Join (or re-join, idempotently) a session by invite code. |
| Request | JSON: `character_id` string or null, `display_name` string (optional; empty → account default). |
| Success | 200 `SessionView` (role `player`; host re-joining stays `host`). |
| Errors | 401; 404 `not_found` for unknown **or closed** sessions (no existence leak); 409 `session_full` if the player cap (§16.6) is reached. |

#### `GET /api/multiplayer/sessions/<invite_code>`

| Field | Contract |
|---|---|
| Purpose | Fetch current session state/presence; refreshes the caller's `last_seen_at`. |
| Auth | Caller must be a **member** (host or joined player). Non-members get 404 `not_found` — knowing a code is not enough to read state without joining. |
| Success | 200 `SessionView`. |
| Errors | 401; 404 for unknown, closed, or not-joined sessions. |

#### `POST /api/multiplayer/sessions/<invite_code>/assignments`

| Field | Contract |
|---|---|
| Purpose | Assign or reassign a character dot to a player. **Host only.** |
| Request | JSON: `player_id` int (`multiplayer_players.id` in this session), `character_id` string present in the session's `state_json` characters. |
| Success | 200 `{ "ok": true, "players": […], "assignments": […], "error": null }`. |
| Errors | 401; 404 for unknown/closed/not-joined; **404 (not 403) for a non-host member** — consistent with the §4 no-enumeration rule; 400 `invalid_assignment` if `player_id` is not in this session or `character_id` is not in the state. |

### 16.3 Invite-code rules (security)

- Generated server-side with `secrets.token_urlsafe(16)` (≥128 bits) — never `random`, never
  sequential, never derived from database ids.
- Unique per session; regenerating on collision is the server's job.
- The code is the *only* join credential, so treat it like a bearer token: never log it at INFO,
  never put it in error messages, and rate-limit guessing (§16.6).

### 16.4 Authorization matrix

| Action | Anonymous | Non-member | Member (player) | Host |
|---|---|---|---|---|
| Create session | 401 | — | — | n/a (creates) |
| Join by valid code | 401 | Becomes player | Idempotent re-join | Idempotent |
| Fetch session | 401 | 404 | Allowed | Allowed |
| Assign dots | 401 | 404 | 404 | Allowed |
| Close session / kick / transfer host | 401 | 404 | 404 | Future work (§16.7) |

### 16.5 Privacy

Session responses expose exactly: player row id, `display_name`, `role`, `assigned_character_id`.
Never `users.email`, `users.password_hash`, OAuth provider ids, or any data about runs/sessions the
caller is not a member of.

### 16.6 Abuse controls

- nginx `limit_req` zone on `POST /api/multiplayer/sessions` and `/join` (same 5 r/m + burst pattern
  as the auth endpoints; tune after real usage).
- Caps, enforced in the backend: **8 players per session**, **5 open sessions per host** (409
  `too_many_sessions` / `session_full`). Numbers are deliberately generous; revise via contract PR.
- Stale sessions: anything with no `last_seen_at` activity for 24h may be treated as closed. No
  background reaper is contracted — lazy enforcement on access is fine.

### 16.7 Deliberately out of scope (first production pass)

- Real-time sync (WebSocket/SSE) and per-action validated mutation endpoints. Until those exist, the
  host's client is authoritative and writes full `state_json`; **non-host players cannot write state
  at all** (assignment is the only mutating player-adjacent operation, and it's host-only).
- Kick, host transfer, invite-code rotation, guest (anonymous) joins, `multiplayer_events` audit log.
- Spectators.

### 16.8 Ownership (extends §5)

| Role | Multiplayer ownership |
|---|---|
| Front end (Charles) | Modal UX, `multiplayer.js` client, `?session=` deep link, presence rendering. |
| Back end (Megan) | SQLModel tables (§16.1), the four endpoints (§16.2), caps (§16.6), backend tests: create/join/duplicate-join/assign happy paths + error envelopes. |
| DB/security (Mario) | Invite-code generation review (§16.3), authorization matrix enforcement + tests (§16.4: 401/404 rules, non-host assignment denial, non-member fetch denial), privacy of session payloads (§16.5), nginx rate limits (§16.6). |

### 16.9 Test checklist (merge gate for the backend PR)

- [ ] Unauthenticated create/join/get/assign → 401 JSON envelope
- [ ] Unknown invite code → 404 `not_found` (same body as not-joined: no existence leak)
- [ ] Non-member GET → 404; joined player GET → 200
- [ ] Duplicate join is idempotent (no duplicate `multiplayer_players` row)
- [ ] Non-host assignment → 404; host assignment → 200 and visible in next GET
- [ ] `invalid_assignment` for foreign `player_id` or unknown `character_id`
- [ ] Invite codes from `secrets.token_urlsafe`, non-sequential across two sessions
- [ ] Session payload contains no email/oauth/password fields
- [ ] Wrong content type / invalid JSON → 400 `invalid_json`

## 17. Final Project Revision Log & Action Items

This revision was driven by the post-rebase review. Where this section assigns work, the contract
above is the authority; mark items done in the PR that lands them.

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | `/api/random-tables`: replace the Week 6 level mapping (2-10 → table 2) with per-level `monsters-N.json` (§3a). Update `tests/test_backend_random_table_proxy.py` mapping test. | Back end (Megan) | **Done** (hardening PR; Megan reviews) |
| 2 | Re-publish `monsters-3..10.json` + `spells/` to the S3 bucket so the proxy and `/site/` serve identical tables (§3a). | Front end (Charles) | **Verified** — bucket spot-checked live (`monsters-3.json`) |
| 3 | Drop `'unsafe-inline'` from `style-src` in `nginx/nginx.conf` (§15.5 — no longer needed). | DB/sec (Mario) | **Done** |
| 4 | Build the multiplayer backend per §16. | Back end (Megan) | **Done** (hardening PR; Megan reviews) |
| 5 | Multiplayer security tests per §16.9 + nginx rate limits (§16.6). | DB/sec (Mario) | **Done** — `tests/test_security_multiplayer.py` |
| 6 | Decide production handling for ShadowDarklings browser automation (§2). | Back end (Megan) + team | **Decided: production-capable behind flag**; install Playwright Chromium in the image and require `SHADOWDARKLINGS_IMPORT_ENABLED=1` in production (§2) |
| 7 | `docs/STATE_SCHEMA.md` synced with `state-schema.js` (run/timers/wandering/characters/inventory/lightSource fields). | DB/sec (Mario) | Done |
| 8 | Wire the login page "Remember me" checkbox to `login_user(remember=…)` (§5 Week 7 item, still unwired). | Back end (Megan) | **Done** (hardening PR) |

See `SECURITY_ASSESSMENT.md` for the full security review backing this revision (residual risks §4
there: Postgres superuser, self-signed cert, Host-header in `invite_url`, e2e HTTPS gap, attack-path
suite not CI-gated).

| 9 | Public TLS cert + DNS for the graded submission EC2: whoever hosts the submission instance owns Certbot/Let's Encrypt setup or documents the self-signed tradeoff in the README. Mario's EC2 (`54.191.130.99`) is dev/test only and is not the submitted URL. | Team (whoever hosts submission EC2) | **Open** |
