# SD Dungeon Generator

**Team:** ShadowDarklings
**Course:** TCSS 506 - Cloud Web Application Engineering with AI

> **Live root:** <https://44-252-95-80.sslip.io>
> **Dungeon frontend:** <https://44-252-95-80.sslip.io/site/>
> **Account entry point:** <https://44-252-95-80.sslip.io/register>

## What It Is

SD Dungeon Generator is a web application for creating and exploring
Shadowdark-inspired procedural dungeons. A player picks a dungeon level (1-10),
generates a tiled dungeon map, and explores it room by room under fog of war,
revealing monsters, treasure, traps, doors, and features as they go.

The app serves tabletop RPG players who want a solo dungeon-delving tool or a
quick dungeon generator when a Dungeon Master is not available.

## Features

- **Procedural dungeon generation** - deterministic seed-based maps with rooms,
  hallways, doors, stairs, water features, rotundas, and custom pixel-art sprites.
- **Fog of war and line-of-sight** - shared `visibleNow` / `exploredEver`
  visibility model with light sources, closed doors, and walls affecting sight.
- **Per-level monster tables** - levels 1-10 each pull from their own
  `monsters-N.json` table, served from the team's S3 bucket and mirrored locally.
- **Traps and search** - hidden traps trigger on movement or interaction; search
  rolls support modifiers and roll breakdowns.
- **Loot and inventory** - treasure log, gear-slot tracking, droppable equipment,
  and dropped item piles on the map.
- **Characters** - login-gated one-click ShadowDarklings import via server-side
  Playwright, plus multi-character party support and active character switching.
- **Damage and spells** - dice roller, clickable attacks, damage expressions, and
  a 5-tier spell library loaded from JSON.
- **Save/load** - Postgres-backed saved runs with full state serialization,
  hydration, and ownership-enforced access.
- **Multiplayer host links** - invite-code sessions where a host shares a link,
  players join, receive character assignments, and sync against host-authoritative
  state by lightweight polling.
- **Authentication and security** - password auth, GitHub OAuth support,
  Flask-Login sessions, CSRF on form routes, Secure/HttpOnly/SameSite cookies,
  HSTS, CSP, rate limiting, and nginx attack-path filtering.

## Architecture

The production stack is:

```text
Browser JS SPA
  -> nginx :443/:80 (TLS, headers, rate limits, static files)
  -> gunicorn over unix socket
  -> Flask + SQLModel
  -> Postgres 16 with persistent pgdata volume
```

**Three Docker containers** are orchestrated by `docker-compose.yml`:

| Container | Image | Role |
|---|---|---|
| `nginx` | `nginx:1.27-alpine` | TLS termination, reverse proxy, security headers, rate limiting, serves `/static/` and `/site/` |
| `app` | Custom Python 3.12 Bookworm image | Flask under gunicorn, API routes, SQLModel ORM, Playwright Chromium runtime |
| `db` | `postgres:16-alpine` | Persistent Postgres storage with no public host port |

**Frontend:** `S3_content/` is a vanilla JS single-page app with canvas
rendering. It is organized into modules including `main.js`, `generator.js`,
`render.js`, `visibility.js`, `interactions.js`, `persistence.js`,
`characters.js`, `multiplayer.js`, `damage.js`, `spells.js`, `timers.js`,
`wandering.js`, `state-schema.js`, `constants.js`, and `rng.js`.

**Backend:** `app.py` provides Flask routes, SQLModel models, Flask-Login,
Flask-WTF CSRF, Authlib GitHub OAuth wiring, ProxyFix support behind nginx, and
JSON APIs for saved runs, multiplayer, random tables, and ShadowDarklings import.

**Extensibility:** the frontend communicates with the backend through documented
JSON contracts in `CONTRACTS.md`. Persistence is concentrated behind SQLModel
models and helper functions. Configuration comes from environment variables and
`.env`, so the app can move hosts or scale app containers without hard-coded
deployment values.

## Deploying Updates

After committing and pushing local changes, deploy to EC2 from PowerShell:

```powershell
.\scripts\deploy-ssm.ps1
```

This uses AWS Systems Manager instead of inbound SSH, so changing home/VPN IPs
do not require security-group edits. The scripts use `SD_DEPLOY_INSTANCE_ID`,
`AWS_REGION`, `SD_DEPLOY_PUBLIC_HOST`, `SD_DEPLOY_REMOTE_REPO`, and
`SD_DEPLOY_BRANCH` when set; see `scripts/deploy-ec2.config.example.ps1`.
`.\scripts\deploy-ec2.ps1` remains available as an SSH fallback.

From AWS CloudShell, use the same SSM path without local AWS CLI credentials:

```bash
bash scripts/deploy-ssm-cloudshell.sh --no-build
```

## Team and Work Split

| Role | Member | Responsibilities |
|---|---|---|
| Frontend | Charles | Dungeon canvas renderer, procedural generator rewrite, sprite assets, fog-of-war/visibility JS, interactions, UI controls, `styles.css`, `about.html`, coordination, e2e smoke testing |
| Backend | Megan | Flask route handlers, S3 random-table proxy, GitHub OAuth wiring, ShadowDarklings headless import, `gunicorn.conf.py`, Dockerfile, ProxyFix, backend API tests, remember-me wiring |
| DB/Security | Mario | SQLModel schema and migrations, Flask-Login setup, ownership 404 rules, session hardening, `nginx.conf`, `docker-compose.yml`, multiplayer security tests, `SECURITY_ASSESSMENT.md`, attack-path scanner, EC2 deployment and verification |

Every member has traceable contributions through feature branches and PR history.

## Running the Production Stack

Prerequisites:

- Docker and Docker Compose
- A `.env` file based on `.env.example`
- Ports 80 and 443 available

Setup:

```shell
cp .env.example .env
# Fill in SECRET_KEY, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, and DATABASE_URL.

mkdir -p nginx/certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout nginx/certs/key.pem -out nginx/certs/cert.pem \
  -days 365 -subj "/CN=localhost"

docker compose up --build
```

Visit <https://localhost> for a local TLS stack, or use
<http://localhost:5000/site/> for quick non-nginx development.

## Running Tests

```shell
pytest tests/ --ignore=tests/e2e -v
pytest tests/test_attack_paths.py -v
pytest tests/e2e -v
```

Current non-e2e collection: **72 tests**.

| Suite | Tests | Covers |
|---|---:|---|
| `test_attack_paths` | 21 | nginx blocks scanner paths; Flask never sees them |
| `test_auth` | 9 | CSRF, page rendering, registration, login, remember-me |
| `test_backend_random_table_proxy` | 4 | Timeout, malformed JSON, invalid level, per-level tables |
| `test_backend_runs_api` | 6 | Saved-run contract and entity kind inference |
| `test_frontend_saved_runs_ui` | 4 | Save/load controls and multiplayer modal structure |
| `test_security_multiplayer` | 16 | Auth, 404 privacy, idempotent join, auto-assignment, host sync, assignment, caps, payload privacy |
| `test_security_run_ownership` | 3 | BOLA-style 404 for non-owned runs |
| `test_security_schema_and_login` | 5 | Tables, constraints, cascade deletes, Flask-Login |
| `test_shadowdarklings_import` | 4 | Auth guard, local bypass, JSON copy, feature-disabled 503 |

## Documentation

| Document | Purpose |
|---|---|
| `CONTRACTS.md` | API contracts, schema, authorization rules, hardening, production stack, multiplayer spec |
| `SECURITY_ASSESSMENT.md` | Security audit, fixed findings, residual risks |
| `AGENTS.md` | AI agent guide for launching and working with the project locally |
| `docs/STATE_SCHEMA.md` | Canonical dungeon state object and serialization rules |
| `docs/VERIFICATION_RUNBOOK.md` | Live-stack verification checklist |
| `docs/EC2_VERIFICATION_WALKTHROUGH.md` | EC2 deployment test results and manual verification report |
| `docs/DEPLOYMENT_GUIDE.md` | Hosting choice, EC2 config, DNS, Let's Encrypt TLS, operations |
| `docs/EC2_FULL_SITE_TODO.md` | Full-site EC2 deployment checklist |
| `.env.example` | Environment variable documentation |

## Known Limitations

- The submitted EC2 deployment uses a Let's Encrypt certificate for
  `https://44-252-95-80.sslip.io/`; local `https://localhost` development uses
  a self-signed certificate.
- The sslip.io hostname is derived from the instance's Elastic IP. If the IP
  changes, the URL changes with it.
- No CI/CD deploy pipeline; deployment is documented and manual.
- Postgres app user is superuser, not least-privilege.
- GitHub OAuth code paths are present, but the submitted EC2 URL currently
  relies on username/password auth unless production OAuth credentials are
  configured.
- ShadowDarklings character import runs a headless browser per request and must
  be explicitly enabled in production with `SHADOWDARKLINGS_IMPORT_ENABLED=1`.
- Multiplayer is host-authoritative and syncs by polling rather than
  WebSockets/SSE.
- Playwright e2e runs over HTTP + SQLite, not the full HTTPS + Postgres stack.
