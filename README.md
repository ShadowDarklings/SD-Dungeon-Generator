# SD Dungeon Generator

**Team:** ShadowDarklings
**Course:** TCSS 506 — Cloud Web Application Engineering with AI

> **Live URL:** `https://<TBD — update before Canvas submission>`

## What It Is

SD Dungeon Generator is a web application for creating and exploring Shadowdark-inspired procedural
dungeons. A player picks a dungeon level (1–10), generates a tiled dungeon map, and explores it room
by room under fog of war — revealing monsters, treasure, traps, doors, and features as they go.

The app serves tabletop RPG players who want a solo dungeon-delving tool or a quick dungeon generator
when a Dungeon Master isn't available.

## Features

- **Procedural dungeon generation** — deterministic seed-based maps on a tile grid with rooms,
  hallways, doors (open / closed / locked / secret / trap / portcullis), stairs, water features,
  and rotundas rendered with custom pixel-art sprites.
- **Fog of war & line-of-sight** — `visibleNow` / `exploredEver` visibility model; walls and
  closed/locked doors block light. Light sources: torch (1h real-time burn) and lantern.
- **Per-level monster tables** — levels 1–10 each pull from their own `monsters-N.json` table,
  served from the team's S3 bucket and mirrored locally.
- **Traps & search** — hidden traps trigger on movement or interaction; search rolls with modifier
  input and hover tooltip for the roll breakdown.
- **Loot & inventory** — collected treasure log with running total, gear-slot tracking, and
  drop-back-to-map behavior.
- **Characters** — import characters from [ShadowDarklings.net](https://shadowdarklings.net) via
  login-gated server-side headless browser automation, or create them
  manually. Multi-character party support with active character switching.
- **Damage & spells** — damage rolls and a 5-tier spell system loaded from JSON.
- **Wandering monsters** — timed encounter checks with configurable odds.
- **Save / load** — Postgres-backed saved runs with full state serialization and hydration.
  Last-write-wins updates; ownership-enforced access (OWASP BOLA 404 rule).
- **Multiplayer host links** — invite-code sessions: host creates a session, shares a link, players
  join and get assigned character dots. Host-authoritative state; real-time sync is future work.
- **GitHub OAuth** — "Sign in with GitHub" alongside password auth; auto-link on email match.
- **Session hardening** — Secure/HttpOnly/SameSite=Lax cookies, 2h sessions, 14-day remember-me,
  CSRF on all form routes, JSON APIs exempt under SameSite + content-type.
- **Production security** — HSTS, X-Frame-Options DENY, nosniff, CSP with `script-src 'self'`
  (no inline scripts), rate limiting on auth and multiplayer endpoints, 20-path attack-path scanner
  test, Postgres behind a trust boundary (no host port).

## Architecture

```
┌─────────────┐       ┌────────────────┐       ┌──────────────┐       ┌──────────────┐
│   Browser   │──────▶│  nginx :443/80 │──────▶│  gunicorn    │──────▶│ Postgres 16  │
│  (JS SPA)   │ HTTPS │  TLS, headers, │ unix  │  Flask app   │  SQL  │  (pgdata vol)│
│             │◀──────│  rate limits,  │ sock  │  SQLModel    │◀─────│              │
│  index.html │       │  static files  │       │              │       │              │
└─────────────┘       └────────────────┘       └──────────────┘       └──────────────┘
    S3_content/           nginx.conf            app.py + models       users, saved_runs,
    src/*.js              nginx/certs/          gunicorn.conf.py      multiplayer_sessions,
    assets/               static/, S3_content/  Dockerfile            multiplayer_players,
    styles.css                                                        oauth_identities
```

**Three Docker containers** orchestrated by `docker-compose.yml`:

| Container | Image | Role |
|---|---|---|
| **nginx** | `nginx:1.27-alpine` | TLS termination, reverse proxy, security headers, rate limiting, serves `/static/` and `/site/` directly |
| **app** | Custom (Python 3.12-slim) | Flask under gunicorn (sync workers, unix socket), all API routes, SQLModel ORM |
| **db** | `postgres:16-alpine` | Persistent storage, no host port exposure (trust boundary) |

**Frontend** (`S3_content/`): vanilla JS single-page app with canvas rendering. 15 modules
(`main.js`, `generator.js`, `render.js`, `visibility.js`, `interactions.js`, `persistence.js`,
`characters.js`, `multiplayer.js`, `damage.js`, `spells.js`, `timers.js`, `wandering.js`,
`state-schema.js`, `constants.js`, `rng.js`).

**Backend** (`app.py`): Flask with SQLModel/SQLAlchemy, Flask-Login, Flask-WTF CSRF, Authlib
(GitHub OAuth), ProxyFix for forwarded headers behind nginx.

**Extensibility:** the frontend talks to the backend through a documented JSON API contract
(`CONTRACTS.md`). Persistence is behind SQLModel — domain logic never issues raw SQL. Configuration
is external (`.env`, `docker-compose.yml` env vars). The app could move hosts or add a second
gunicorn instance without code changes.

## Team & Work Split

| Role | Member | Responsibilities |
|---|---|---|
| **Frontend** | Charles | Dungeon canvas renderer, procedural generator (Watabou-style rewrite), sprite assets, fog-of-war/visibility JS, interactions, UI controls (save/load/multiplayer modals), `styles.css`, `about.html`, coordinator duties, e2e smoke test |
| **Backend** | Megan | Flask route handlers, S3 random-table proxy, Authlib GitHub OAuth wiring, ShadowDarklings headless import, `gunicorn.conf.py`, `Dockerfile`, ProxyFix, backend API tests, remember-me wiring |
| **DB / Security** | Mario | SQLModel schema & migrations, Flask-Login setup, ownership 404 rules, session hardening (cookies/CSRF), `nginx.conf` (TLS, headers, CSP, rate limits), `docker-compose.yml`, multiplayer security tests (§16.9), `SECURITY_ASSESSMENT.md`, attack-path scanner, EC2 deployment & verification |

Every member has traceable contributions via feature branches and PR history.

## Running the Production Stack

The production stack runs **nginx → gunicorn → Flask → Postgres** over HTTPS.

### Prerequisites

- Docker and Docker Compose
- A `.env` file (see `.env.example` for required variables)
- Ports 443 and 80 free

### Setup

```shell
# 1. Create your .env
cp .env.example .env
# Fill in SECRET_KEY, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET

# 2. Generate a self-signed TLS certificate (never committed)
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout nginx/certs/key.pem -out nginx/certs/cert.pem \
  -days 365 -subj "/CN=localhost"

# 3. Start the stack
docker compose up --build

# 4. Visit https://localhost (accept the self-signed certificate warning)
```

### Running Tests

```shell
# Unit + contract + security tests (from host, with venv)
pytest tests/ --ignore=tests/e2e -v

# Or inside the app container (tests dir excluded from prod image;
# run from host or mount tests/ manually)
docker compose exec app pytest -v --ignore=tests/e2e

# Attack-path scanner (requires the full stack running)
pytest tests/test_attack_paths.py -v

# Playwright e2e (requires host-side Playwright + chromium)
pytest tests/e2e -v
```

**Test inventory (60 tests):**

| Suite | Tests | Covers |
|---|---|---|
| `test_attack_paths` | 21 | nginx blocks 20 scanner paths; flask-never-saw assertion |
| `test_auth` | 8 | CSRF rejection, registration, login, remember-me cookie |
| `test_security_multiplayer` | 11 | Full §16.9 checklist: auth, 404 rules, idempotent join, assignment, caps, privacy |
| `test_security_run_ownership` | 3 | BOLA 404 on non-owned runs |
| `test_security_schema_and_login` | 5 | Table existence, constraints, cascade deletes, Flask-Login |
| `test_backend_random_table_proxy` | 4 | Timeout, malformed JSON, level validation, per-level mapping |
| `test_backend_runs_api` | 1 | Create saved run contract |
| `test_frontend_saved_runs_ui` | 4 | Save/load/overwrite controls, multiplayer modal structure |
| `test_shadowdarklings_import` | 3 | Auth guard, JSON copy, feature-disabled 503 |

## Local Development (without the production stack)

For quick local development without nginx or TLS:

```shell
docker compose up -d
```

Browse to `http://localhost:5000/site/` for the dungeon frontend.

## Documentation

| Document | Purpose |
|---|---|
| [`CONTRACTS.md`](CONTRACTS.md) | Full API contracts, schema, authorization rules, session hardening, production stack, multiplayer spec |
| [`SECURITY_ASSESSMENT.md`](SECURITY_ASSESSMENT.md) | Security audit: findings fixed, posture by area, residual risks |
| [`AGENTS.md`](AGENTS.md) | AI agent guide for launching and working with the project |
| [`docs/STATE_SCHEMA.md`](docs/STATE_SCHEMA.md) | Canonical dungeon state object shape and serialization rules |
| [`docs/VERIFICATION_RUNBOOK.md`](docs/VERIFICATION_RUNBOOK.md) | Live-stack security & integration checklist |
| [`docs/EC2_VERIFICATION_WALKTHROUGH.md`](docs/EC2_VERIFICATION_WALKTHROUGH.md) | EC2 deployment test results and manual verification report |
| [`DEPLOY_AWS.md`](DEPLOY_AWS.md) | AWS deployment notes |
| [`.env.example`](.env.example) | Environment variable documentation |

## Known Limitations

- Self-signed TLS certificate on the dev/test EC2; see `CONTRACTS.md` §15.11 for the submission
  cert ownership note.
- No CI/CD deploy pipeline; documented as intended only.
- Postgres app user is superuser, not least-privilege.
- ShadowDarklings character import runs a headless browser per
  request and must be explicitly enabled in production with `SHADOWDARKLINGS_IMPORT_ENABLED=1`.
- Multiplayer is host-authoritative with no real-time sync yet (§16.7).
- Playwright e2e runs over HTTP + SQLite, not the full HTTPS + Postgres stack.
