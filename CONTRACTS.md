# SD Dungeon Generator - CONTRACTS.md

**Team:** ShadowDarklings  
**Week:** 6  
**Project:** Procedural Shadowdark dungeon generator  
**Contract status:** Load-bearing. Change this document first, then tests, then code.

This document defines what the Week 6 system does. It is not an implementation
plan. The back-end role builds the API described here, the front-end role
consumes it, and the database/security role verifies the schema and
authorization behavior. If this contract is wrong, update `CONTRACTS.md` and
the affected tests before changing application code.

Existing skeleton routes remain in place: `/`, `/site/`, `/site/<path>`,
`/register`, `/login`, `/logout`, and `/about`.

## 1. Schema

### Table: `users` (existing skeleton table)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Autoincrement user id. |
| `username` | VARCHAR(80) | UNIQUE, NOT NULL, indexed | Login name. |
| `password_hash` | VARCHAR(255) | NOT NULL | Werkzeug password hash. |
| `created_at` | TIMESTAMP WITH TIME ZONE | NOT NULL | Defaults to current time. |

Week 6 changes the auth integration to Flask-Login, but the user table shape
does not change.

### Table: `saved_runs` (new)

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

### Table: `tiles` (new)

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

### Table: `rooms` (new)

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

### Table: `halls` (new)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | Database row id. |
| `saved_run_id` | INTEGER | NOT NULL, FK to `saved_runs.id` ON DELETE CASCADE, indexed | Parent run. |
| `hall_key` | VARCHAR(80) | NOT NULL | Runtime hall id from state. |
| `from_room_id` | VARCHAR(80) | NULL | Runtime source room id. |
| `to_room_id` | VARCHAR(80) | NULL | Runtime destination room id. |

**UNIQUE constraint:** `(saved_run_id, hall_key)`.

### Table: `entities` (new)

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

### Table: `loot_entries` (new)

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

### `DELETE /api/runs/<run_id>`

| Field | Contract |
|---|---|
| Purpose | Delete an owned saved dungeon run. |
| Auth | Required. |
| Request | No body. |
| Success | HTTP 204 with no response body. |
| Errors | 401 `login_required`; 404 `not_found` for missing or not-owned runs. |

### `GET /api/random-tables`

| Field | Contract |
|---|---|
| Purpose | Server-side read of the dungeon data source used by the client. This is the Week 6 external-world route. |
| Auth | None required. |
| Request | Query params: `type` is `monsters` or `traps`; `level` is 1-10 and required for `monsters`. |
| Upstream | Uses `requests` to fetch the configured S3/static website JSON URL. |
| Success | HTTP 200 JSON: `{ "results": [...], "source": "<url>", "error": null }`. |
| Errors | 400 `invalid_table`, 400 `invalid_level`, 503 `timeout`, 503 `rate_limited`, 503 `upstream_invalid`. |

## 3. External API Contract

The project's data source is the team's static dungeon content hosted on AWS S3
static website hosting, also mirrored locally through Flask at `/site/`.

| Item | Contract |
|---|---|
| Base URL | `http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com` |
| Monster tables | `/monsters-1.json`, `/monsters-2.json`; levels 1 maps to table 1, levels 2-10 map to table 2 for Week 6. |
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

Ownership-restricted resources must use the OWASP-style 404-for-not-yours
rule. A user must not be able to learn whether another user's saved run exists.

## 5. Role Boundaries And Role-Specific Guides

### Front end

**Builds this week**

- Save/load controls in `S3_content/index.html` and related client assets.
- JavaScript that serializes the current dungeon state into the `POST /api/runs`
  request shape.
- JavaScript that loads `GET /api/runs/<run_id>` responses back into playable
  state.
- User-facing empty, success, and failure states for saving and loading.

**Owns**

- `S3_content/index.html`
- `S3_content/styles.css`
- `S3_content/src/*.js` when the change is UI behavior or client state
- Front-end tests such as `tests/test_frontend_saved_runs_ui.py` and
  `tests/test_frontend_state_contract.py`

**Does not touch without team agreement**

- SQLModel schema definitions.
- Flask-Login setup.
- Server route authorization logic.
- `CONTRACTS.md` except through a contract revision PR.

### Back end

**Builds this week**

- `GET /runs`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/<run_id>`
- `PUT /api/runs/<run_id>`
- `DELETE /api/runs/<run_id>`
- `GET /api/random-tables`
- Request/response validation and JSON error envelopes from this contract.

**Owns**

- Flask route handlers in `app.py` or an agreed routes module.
- `requests` call to the S3/static JSON upstream.
- Back-end tests such as `tests/test_backend_runs_api.py`,
  `tests/test_backend_run_lifecycle.py`, and
  `tests/test_backend_random_table_proxy.py`.

**Does not touch without team agreement**

- Client rendering and canvas gameplay logic.
- Password hashing or Flask-Login configuration.
- Database schema beyond what is needed to consume the security role's models.

### Database / security

**Builds this week**

- SQLModel models for the schema in section 1.
- Flask-Login setup: `LoginManager`, user loader, `login_user`,
  `logout_user`, `current_user`, and `@login_required`.
- Ownership checks that return 404 for not-owned runs.
- Database-level constraints: foreign keys, unique constraints, level check,
  cascade deletes.

**Owns**

- SQLModel model definitions in `app.py` or an agreed models module.
- Auth/session refactor in Flask.
- Security tests such as `tests/test_security_schema_and_login.py` and
  `tests/test_security_run_ownership.py`.

**Does not touch without team agreement**

- Client UI implementation.
- External JSON parsing behavior beyond the security implications of inputs.
- Endpoint response shapes except to enforce this contract.

### Coordinator

**Builds this week**

- Keeps `CONTRACTS.md`, `coord_session.md`, and the four official failing test
  files aligned.
- Owns contract revisions when tests expose a bad agreement.
- Composes the whole-system e2e walk with role input.

**Owns**

- `CONTRACTS.md`
- `coord_session.md`
- `e2e.md`
- `tests/test_integration.py`

## 6. Known Limitations (Deliberate)

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
- CSRF protection is out of scope for Week 6 and should be revisited with Week
  7 session hardening.

## 7. E2E Walk Anchor

The whole-system e2e should prove this boundary:

Browser `/site/` -> Flask save/load API -> Postgres saved run rows -> S3/static
JSON dungeon tables.

At minimum, the team walk should register a user, generate a dungeon with a
real seed and level, hit the real static JSON table source at least once, save
the run, reload it, update exploration or loot state, verify persistence in
Postgres, and verify a second user receives 404 for the first user's run.
