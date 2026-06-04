# SD Dungeon Generator

**Team:** ShadowDarklings

**Members:**

  - **Megan** (server-side)
  - **Charles** (client-side)
  - **Mario** (database and security)

Project: SD Dungeon Generator is a web app for creating and exploring Shadowdark-inspired procedural dungeons.

A user selects a dungeon level, generates a gridded dungeon map, begins in an entrance room under fog of war, and reveals rooms, doors, monsters, treasure, and traps as they explore. The app is for Shadowdark RPG players who want a solo dungeon-delving tool or a quick dungeon generator when they do not have a Dungeon Master available.

MVP: In version 1, the site will generate a random square-grid dungeon with rooms, hallways, doors, rock/wall space, a starting room, fog of war, and simple click-to-reveal exploration. 

Dungeon level 1-10 will affect JSON-based random tables for room contents, encounters, treasure, traps, and door states. 

The first version will prioritize a working playable map, readable generated room data, and deployment to AWS; player accounts, saved games, real-time torch tracking, curved rooms, advanced line-of-sight, and expanded procedural art are stretch goals if time allows.

External APIs: Our main external platform will be AWS, likely using static hosting through Amplify or S3/CloudFront and, if time allows, API Gateway/Lambda/DynamoDB for save files. 
Our backup is a static client-only version that uses local JSON data and browser localStorage, which avoids auth, rate limits, and free-tier database concerns. 

Why this project? 
We are excited because it combines game design, procedural generation, data modeling, frontend interaction, backend deployment, and security decisions in one project. 
It also has real audience potential: tabletop RPG players don't currently have a website that can act as an automated DM. This fills that niche and could grow beyond the class into a larger public-funded dungeon generator for solo or DM-less TTRPG play.

## Current MVP Prototype

The prototype now includes:
- Deterministic procedural room/hall generation on a 46x31 tile grid (52px tiles).
- Layered canvas renderer for topology, tokens, and fog-of-war.
- Line-of-sight fog model with `visibleNow` and `exploredEver` memory.
- Walls and closed/locked doors block light.
- Interactive map tokens: defeat monsters, collect treasure, reveal traps.
- Door states affect play: open doors pass movement/light, closed and locked doors block them.
- Monster names and basic stats load from the existing level JSON tables.
- Hidden traps load from `traps.json`, can be triggered by tile movement, doors, or treasure, and reveal their stats when found or triggered.
- Search rolls support a one-digit modifier and show the total with a hover tooltip for the roll breakdown.
- Loot log with running total and drop-back-to-map behavior.

## Running the Production Stack

The production stack runs **nginx → gunicorn → Flask → Postgres** over HTTPS with a self-signed certificate.

### Prerequisites

- Docker and Docker Compose
- A `.env` file in the repo root (see `.env.example` for required variables)
- Port 443 and 80 free on your machine

### Setup

1. **Create your `.env`** from the example:
   ```shell
   cp .env.example .env
   # Fill in SECRET_KEY, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET
   ```

2. **Generate a self-signed TLS certificate** (generated locally, never committed):
   ```shell
   mkdir -p nginx/certs
   openssl req -x509 -newkey rsa:2048 -nodes \
     -keyout nginx/certs/key.pem -out nginx/certs/cert.pem \
     -days 365 -subj "/CN=localhost"
   ```

3. **Start the stack:**
   ```shell
   docker compose up --build
   ```

4. **Visit** `https://localhost` (accept the self-signed certificate warning).

The stack brings up three containers:
- **nginx** — TLS termination, reverse proxy, security headers, rate limiting, static asset serving
- **app** — Flask under gunicorn (sync workers, unix socket)
- **db** — Postgres 16 (data persisted in a named Docker volume, not exposed to the host network)

### Running the attack-path test

With the stack running:
```shell
pytest tests/test_attack_paths.py -v
```

This tests 20 known scanner paths (`/wp-login.php`, `/.env`, `/.git/config`, etc.) against nginx and asserts they all return 404/403.

## Local Development (without the production stack)

For quick local development without nginx or TLS:

```shell
docker compose up -d
```

Then browse to `http://localhost:5000`.

The Flask app provides the home page, auth flow, About page, and `/site/` route.
The dungeon frontend is committed in `S3_content/` and is served at
`http://localhost:5000/site/`.

Run the local tests with:

```shell
docker compose exec app pytest -v
```

## Additional Docs

- State schema: `docs/STATE_SCHEMA.md`
- AWS deployment notes: `DEPLOY_AWS.md`
- Week 5 group setup: `WEEK5_GROUP_SETUP.md`
- Contract and API documentation: `CONTRACTS.md`

