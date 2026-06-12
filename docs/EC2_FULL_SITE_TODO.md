# EC2 Full-Site Deployment Todo

Goal: host ShadowSpawner as a full Flask/Postgres site on EC2, not as a static
frontend, so login, saves, invites, character assignments, and ShadowDarklings
imports all work in production.

## Branch Scope

- Branch: `EC2-full-site`
- Base: merged `main` after the ShadowSpawner frontend PR
- Deployment target: EC2 Docker Compose stack
- Public app route: `/site/`

## Code Readiness

- [x] Install Playwright Chromium in the production Docker image.
- [x] Add production feature flag support for ShadowDarklings import.
- [x] Pass `SHADOWDARKLINGS_IMPORT_ENABLED` through Docker Compose.
- [x] Document `SHADOWDARKLINGS_IMPORT_ENABLED=1` in `.env.example`.
- [ ] Rebuild the Docker image on EC2 with `docker compose up -d --build`.
- [ ] Confirm the import route returns `401 login_required` when logged out, not a 502/500.
- [ ] Confirm a logged-in user can import one ShadowDarklings character.

## EC2 Environment

- [ ] Pull or clone the merged repo on EC2.
- [ ] Check out `EC2-full-site` for staging, or `main` after this branch merges.
- [ ] Create production `.env` from `.env.example`.
- [ ] Set a strong `SECRET_KEY`.
- [ ] Set `DATABASE_URL=postgresql://app:app@db:5432/app`.
- [ ] Set `FLASK_ENV=production`.
- [ ] Set `SHADOWDARKLINGS_IMPORT_ENABLED=1`.
- [ ] Set GitHub OAuth credentials.
- [ ] Confirm GitHub OAuth callback is `https://<domain>/auth/github/callback`.

## HTTPS And Network

- [ ] Point a domain or subdomain at the EC2 public IP.
- [ ] Replace self-signed certs with Let's Encrypt certs, or switch the proxy to Caddy.
- [ ] Open EC2 inbound ports `80` and `443`.
- [ ] Restrict inbound SSH `22` to trusted IPs only.
- [ ] Confirm Postgres has no public host port.

## Smoke Test

- [ ] Visit `/` over HTTPS.
- [ ] Visit `/site/` and generate a dungeon.
- [ ] Register a user.
- [ ] Log in with username/password.
- [ ] Log in with GitHub OAuth.
- [ ] Import a ShadowDarklings character.
- [ ] Save a game.
- [ ] Load the saved game.
- [ ] Create a multiplayer invite.
- [ ] Join invite as another account/session.
- [ ] Assign a character to the joined player.
- [ ] Restart containers and confirm saves persist.

## Operations

- [ ] Add a simple `pg_dump` backup command.
- [ ] Store backups outside the Docker volume.
- [ ] Capture deploy commands in `DEPLOY_AWS.md`.
- [ ] Capture final live URL in `README.md`.
- [ ] Add a short rollback note: redeploy previous commit and keep `pgdata`.
