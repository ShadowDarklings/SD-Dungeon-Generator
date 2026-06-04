# Assignment 8 — Part B: Common Questions
**Name:** Charles (Frontend Role)  
**Project:** Shadowdark Procedural Dungeon Generator  

---

### 1. What does nginx do that your Flask app shouldn't or can't?

Nginx handles TLS termination on port 443 so our Flask process never deals with certificate negotiation or HTTPS overhead. It also serves our entire dungeon frontend (`S3_content/` — 12 JavaScript modules, `styles.css`, the map canvas UI) directly from disk with `expires 30d` cache headers, meaning the browser caches our 2,000+ lines of canvas rendering code without a single Python worker touching it. And it injects security headers like `X-Frame-Options: DENY` and `Strict-Transport-Security` on every response — headers that protect the browser session but have nothing to do with Flask's application logic.

### 2. What does gunicorn do that flask run doesn't?

`flask run` uses Werkzeug's single-threaded dev server. If one player is saving a dungeon run via `POST /api/runs` and the Postgres commit takes 200ms, every other player's request blocks — the map won't load, `GET /api/random-tables` hangs, and the entire UI freezes. Gunicorn forks multiple worker processes, so concurrent requests are handled independently. It also never exposes debug tracebacks to the browser, and it restarts crashed workers automatically so a single bad request doesn't bring down the site.

### 3. "Hardening" means making something harder to misuse. What's one specific thing your stack is now harder to misuse than it was last week? Point at something concrete.

The `X-Content-Type-Options: nosniff` header that nginx now injects on every response. Last week, if an attacker uploaded a file with a `.txt` extension but containing JavaScript, the browser might MIME-sniff it and execute it as script. With `nosniff`, the browser strictly respects the `Content-Type` header — our dungeon JSON tables (`monsters-1.json`, `traps.json`) are served as `application/json` and will never be reinterpreted as executable content, regardless of what's inside them.

### 4. If you wanted to add a load balancer to this picture, where would it go, and what problem would it solve that nginx isn't already solving?

It would sit in front of our nginx container — like an AWS ALB on port 443 distributing traffic across multiple identical nginx→gunicorn stacks. Our current setup has one nginx instance handling all requests, which is fine for the class project. But if we had hundreds of concurrent dungeon players and needed horizontal scaling, a load balancer would route traffic across replicas, handle health checks, and enable zero-downtime deploys by draining connections from old instances before swapping in new ones.

### 5. What's a single point of failure in your current setup? There's more than one acceptable answer.

The nginx container. If it crashes or hangs, nothing reaches our app — not the dungeon frontend, not the API, not the login flow. Every external request goes through that one nginx process. Gunicorn and Postgres could be perfectly healthy but users would see a connection refused error. Unlike the app container (where gunicorn can restart workers), nginx has no built-in redundancy in our setup.

### 6. If someone runs docker-compose down on production, what happens to the data in your database? The answer depends on what your team's compose file looks like — go check.

Our `docker-compose.yml` declares a named volume `pgdata` mounted at `/var/lib/postgresql/data`. Running `docker compose down` destroys the containers but the named volume persists — all user accounts, OAuth identities, and saved dungeon runs survive. The data only disappears if you explicitly run `docker compose down -v`, which deletes volumes. I verified this by checking our compose file directly.

### 7. What's one thing you learned about your stack from your LLM this week that surprised you, and why?

I was surprised that nginx's `alias` directive behaves differently from `root` in a subtle but security-critical way. With `location /site/` + `alias /app/S3_content/`, if the location doesn't end with a trailing slash that matches the alias, a path traversal like `/site../app.py` could potentially escape the served directory and leak Flask source code. I'd assumed `alias` was just a synonym for `root` with a different base path, but the LLM explained that `alias` replaces the matched prefix while `root` prepends — and that mismatch creates a real attack vector if you're not careful with trailing slashes.
