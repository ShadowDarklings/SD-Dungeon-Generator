# EC2 Full-Site Deployment Todo

Goal: host ShadowSpawner as a full Flask/Postgres site on EC2, not as a static
frontend, so login, saves, invites, character assignments, and ShadowDarklings
imports all work in production.

## Branch Scope

- Branch: `EC2-full-site` for staging; final submission should deploy from `main`
- Base: merged `main` after the ShadowSpawner frontend PR
- Deployment target: EC2 Docker Compose stack
- Public app route: `/site/`

## Code Readiness

- [x] Install Playwright Chromium in the production Docker image.
- [x] Add production feature flag support for ShadowDarklings import.
- [x] Pass `SHADOWDARKLINGS_IMPORT_ENABLED` through Docker Compose.
- [x] Document `SHADOWDARKLINGS_IMPORT_ENABLED=1` in `.env.example`.
- [x] Rebuild the Docker image on EC2 with `docker compose up -d --build`.
- [x] Confirm the import route returns `401 login_required` when logged out, not a 502/500.
- [x] Confirm the app container can import one ShadowDarklings character.

## EC2 Environment

- [x] Pull or clone the merged repo on EC2.
- [x] Check out `EC2-full-site` for staging, or `main` after this branch merges.
- [x] Create production `.env` from `.env.example`.
- [x] Set a strong `SECRET_KEY`.
- [x] Set `DATABASE_URL=postgresql://app:app@db:5432/app`.
- [x] Set `FLASK_ENV=production`.
- [x] Set `SHADOWDARKLINGS_IMPORT_ENABLED=1`.
- [ ] Set real GitHub OAuth credentials.
- [ ] Confirm GitHub OAuth callback is `https://<domain>/auth/github/callback`.

## HTTPS And Network

- [x] Point a domain or subdomain at the EC2 public IP.
- [x] Replace self-signed certs with Let's Encrypt certs, or switch the proxy to Caddy.
- [x] Open EC2 inbound ports `80` and `443`.
- [x] Restrict inbound SSH `22` to trusted IPs only.
- [x] Confirm Postgres has no public host port.

## Smoke Test

- [x] Visit `/` over HTTPS from EC2 localhost.
- [x] Visit `/site/` over HTTPS from EC2 localhost.
- [x] Register a user.
- [x] Log in with username/password.
- [ ] Log in with GitHub OAuth.
- [x] Import a ShadowDarklings character.
- [x] Save a game.
- [x] Load the saved game.
- [x] Create a multiplayer invite.
- [x] Join invite as another account/session.
- [x] Assign a character to the joined player.
- [x] Restart containers and confirm app/database containers recover with pgdata intact.

## Operations

- [ ] Add a simple `pg_dump` backup command.
- [ ] Store backups outside the Docker volume.
- [x] Capture deploy commands in `DEPLOY_AWS.md`.
- [x] Capture final live URL in `README.md`.
- [ ] Add a short rollback note: redeploy previous commit and keep `pgdata`.
