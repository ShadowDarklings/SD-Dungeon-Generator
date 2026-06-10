# Mario's Speaker Notes — Week 10 Final Presentation

> Target: ~4.5 min across slides 3–5, plus ~30s comments during demo, plus ~45s AI reflection.
> Read naturally — don't memorize word-for-word. These are talking points.

---

## Slide 3 — Production Stack Topology (~1.5 min)

**[Charles hands off: "Now Mario will walk us through the production stack."]**

> Thanks Charles. So let me trace a request from the browser all the way down to the database.

- Everything starts over **HTTPS on port 443**. The browser hits nginx first — it's an Alpine container that handles TLS termination, so Flask never deals with certificates.

- nginx also serves the static assets directly — the `/static/` folder and the dungeon frontend at `/site/`. That means the canvas game loads without ever touching Python.

- For dynamic routes — login, the API, saving games — nginx proxies over a **Unix socket** to gunicorn, which runs Flask with 5 sync workers. We use `preload_app=True` for memory efficiency, and a `post_fork` hook disposes the shared database engine so each worker gets its own clean connection pool.

- Flask talks to **Postgres 16** over the Docker internal network. The key thing here: Postgres has **no ports published to the host**. The only process that can reach the database is the app container — that's our trust boundary.

- We also reach two external services: **GitHub OAuth** for login, and **Charles's S3 bucket** for the monster and trap tables that feed into dungeon generation.

- The whole stack comes up with a single `docker compose up --build`.

---

## Slide 4 — Database Schema (~1.5 min)

> Now let me walk through the 8 tables.

- At the top we have the **auth layer** — two tables. `users` stores both password and OAuth-only accounts. The `password_hash` is **nullable** — if you logged in via GitHub, you don't have a password. `oauth_identities` links a GitHub ID to a user via a `UNIQUE(provider, provider_user_id)` constraint — so one GitHub account can only link to one user.

- The core of the game persistence is `saved_runs`. This is the **parent table** — it holds the user, the seed, the level with a `CHECK` constraint between 1 and 10, and a `state_json` column that stores the **entire dungeon state as a JSON blob**. This is the source of truth when you load a saved game.

- Below that, we have **5 child tables** — tiles, rooms, halls, entities, and loot entries. Each one has a `UNIQUE` constraint and `CASCADE` delete back to the parent run. When you delete a saved game, everything goes with it — no orphaned data.

- The design choice to keep the JSON blob *and* the relational tables is intentional. The JSON blob gives us fast, atomic save/load. The relational tables give us the ability to query across runs — "how many rooms did this user explore total?" — if we ever need analytics.

---

## Slide 5 — Security Defense in Depth (~1 min)

> Security is layered across all three containers.

- **nginx** is our first line of defense. We tested 20 common attack paths — things like `/wp-login.php`, `/.env`, `/.git/config` — and they all return 404. Auth endpoints are rate limited to 5 requests per minute with a burst of 3, so brute-force login attempts get throttled. We also ship a full set of security headers: HSTS, X-Frame-Options DENY, Content-Security-Policy, Referrer-Policy.

- **Flask** handles session security. Cookies are `HttpOnly` and `SameSite=Lax`, sessions expire after 2 hours, and remember-me tokens last 14 days. For authorization, we follow the **OWASP BOLA rule** — if you try to load someone else's saved run, you get a 404, not a 403. That way an attacker can't even confirm whether a run ID exists. Secrets are loaded via `os.environ["KEY"]` — the app **crashes on startup** if any required secret is missing, rather than silently falling back to a default.

- **Postgres** is locked behind the Docker network. No host ports, parametrized queries through SQLModel, ownership isolation per user, and constraint enforcement on every table.

- **The takeaway: each layer handles its own job.** nginx blocks scanners, Flask enforces auth, Postgres isolates data.

---

## Slide 6 — Demo Comments (~30s total, interspersed)

**When Charles shows save/load (step 5):**
> That save just wrote the full dungeon state — every tile, room, entity — as a JSON blob into Postgres, plus decomposed it into the 5 child tables. When we load, we pull back the JSON and reconstruct the exact map state.

**When Charles shows logout → /runs (step 6):**
> And now that we're logged out, hitting /runs redirects to login. If you tried to guess a run ID directly via the API, you'd get a 404 — that's the BOLA rule, we don't reveal whether the resource exists.

---

## Slide 9 — AI Usage Reflection (~45s)

> For my part — DB and security — I used AI to **scaffold** the initial configs. The CONTRACTS.md addendum, the nginx.conf structure, docker-compose, and the attack-path test boilerplate all started as AI-generated drafts.

> But here's where it fell short: the nginx rate-limit zones needed manual tuning — the AI got the syntax right but the zone sizing wrong. ProxyFix arguments were sometimes incorrect — I had to verify against Werkzeug docs. And fundamentally, any security configuration needs human review. You can't just trust AI output when it's your auth layer.

> The pattern that worked: let AI do the first draft, then verify every line against the official docs and test it manually.

---

## Slide 7 — What Worked / What Didn't (Mario's items, ~30s)

**If prompted on "what's solid":**
> The contract-first approach really paid off — CONTRACTS.md defined the schema, the API, and the security rules before we wrote code. That meant we could test against the spec.

**If prompted on "held together with tape":**
> Honestly, CSRF enforcement is technically in place but we had to exempt the form routes to unblock frontend work. The tokens are rendered in forms but not validated. That's a gap we'd close with more time.

---

## Common Questions I Should Be Ready For

**Q: Why a JSON blob AND relational tables?**
> The JSON blob is the source of truth for fast atomic save/load. The relational tables give us queryability — stats, analytics, and constraint enforcement at the DB level. Belt and suspenders.

**Q: Why no ports on Postgres?**
> Least-privilege. The only process that needs the database is the app container. Publishing the port would let anything on the host (or network) connect to Postgres directly.

**Q: What's the `post_fork` hook about?**
> When gunicorn uses `preload_app=True`, the SQLModel engine is initialized once in the master process. Without the hook, all workers would share the same connection pool — which causes socket collisions. The `post_fork` disposes the inherited engine so each worker creates its own.

**Q: Why 404 instead of 403 for unauthorized run access?**
> OWASP BOLA (Broken Object Level Authorization). If we returned 403, an attacker could enumerate valid run IDs. 404 reveals nothing.
