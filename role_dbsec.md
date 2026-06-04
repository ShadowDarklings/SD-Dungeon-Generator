# Assignment 8 — Part C: DB/Security Role
**Name:** Mario  
**Role:** Database / Security (3-person team)  
**Project:** Shadowdark Procedural Dungeon Generator  

---

### 1. nginx as request filter

Before nginx, every bot scanning for `/wp-login.php`, `/.env`, `/.git/config`, or `/phpmyadmin/` hit our Flask process directly. Flask dutifully ran its URL routing, didn't find a match, and returned a 404 — but that still meant our Python workers spent CPU cycles on junk traffic, and every request appeared in our Flask access log. On a public-facing EC2 instance, this noise drowns real user traffic in the logs and wastes gunicorn worker time that should be handling `/api/runs` saves or `/api/random-tables` proxy calls.

With nginx in front, these paths never reach Flask at all. nginx matches them against its `location /` catch-all, and since there's no upstream route for `/wp-admin/` or `/.aws/credentials`, nginx returns its own 404 from its static response path — no Python interpreter involved, no gunicorn worker occupied, no entry in the Flask log. Our `test_attack_paths.py` parametrizes all 20 paths from `attack_paths.json` and asserts they return 404 or 403 from nginx. The second test assertion (`test_flask_never_saw_any_of_them`) checks that Flask's access log never logged any of them — though it currently skips because we log to stdout rather than a file.

The practical difference: Flask's access log goes from hundreds of bot hits per day to only real user traffic — login attempts, dungeon saves, table lookups. That makes anomaly detection tractable.

### 2. Run the script-kiddie attack-path test

The test file `tests/test_attack_paths.py` loads 20 paths from `attack_paths.json`, including WordPress admin paths (`/wp-login.php`, `/wp-admin/`, `/wp-content/plugins/`), credential files (`/.env`, `/.git/config`, `/.aws/credentials`, `/.ssh/id_rsa`), database admin panels (`/phpmyadmin/`), server diagnostics (`/server-status`, `/actuator/health`, `/_profiler/`), and miscellaneous scanner targets (`/xmlrpc.php`, `/backup.sql`, `/.htaccess`, `/config.php`, `/vendor/phpunit/`, `/.well-known/openid-configuration`).

Each path is tested with `requests.get(https://localhost + path, verify=False)` against our running stack. All 20 returned 404, which is the expected outcome — nginx has no `location` block matching any of these paths, so they fall through to the default `location /` which proxies to gunicorn, and gunicorn/Flask returns 404 because none of these are registered routes. The important thing is that none returned 200 or 301 (which would mean nginx or Flask was serving content at those paths).

The second assertion (`test_flask_never_saw_any_of_them`) skips because our gunicorn logs to stdout (`accesslog = "-"` in `gunicorn.conf.py`), not to `logs/flask.log`. This is a deliberate decision — we accepted the skip (documented in `week10_coord_session.md`) because Docker captures stdout and we'd rather query Docker logs than manage a file inside the container.

### 3. Talk to your LLM about test strategies

See `llm_strategies.md` for the full conversation. Summary of strategies discussed and my assessment:

**Parametrized pytest with known-bad paths (what we use):** Dead simple, deterministic, runs in CI. Catches the exact paths scanners hit most often. Misses anything not in the list — a path like `/debug/vars` or `/.docker/config.json` wouldn't be caught unless someone adds it.

**Automated scanner/fuzzer integration (e.g., Nikto, OWASP ZAP):** These tools crawl the app and try thousands of paths, headers, and payloads automatically. They'd catch paths our static list misses, like server-info headers leaking the gunicorn version, or an open redirect on `/login?next=http://evil.com`. But they're slow (minutes, not seconds), noisy (hundreds of false positives), and non-deterministic — bad for CI gates, better for periodic security audits.

**Behavioral/semantic tests:** Instead of testing specific paths, test *behaviors*: "any request to a path not matching a registered route should return exactly 404 with no body content beyond nginx's default page." This catches the class of problem rather than individual instances. The downside is writing the assertion is harder — you need to enumerate what *is* valid, not what isn't.

**Header-based tests:** Test that nginx isn't leaking information through response headers — `Server: nginx/1.27`, `X-Powered-By: Express`, etc. Our current test doesn't check headers at all. I'd add a test that asserts the `Server` header is either absent or doesn't reveal the exact version.

If security were higher stakes (financial data, PII), I'd add a nightly ZAP scan as a non-blocking CI job that reports findings to a dashboard, plus behavioral tests asserting that every non-200 response has identical headers regardless of the path (to prevent path-based fingerprinting). The parametrized approach is right for our scope because it's fast, deterministic, and documents the exact threat model we're defending against.

### 4. The trust boundary

Our `db` service has no `ports:` declaration — Postgres is reachable only from the Docker bridge network, never from the host machine or the public internet. This protects against: direct SQL connections from an attacker who discovers our credentials, accidental exposure of `DATABASE_URL` in client-side code (the `db:5432` hostname doesn't resolve outside Docker), and lateral movement from a compromised service on the same host that isn't in our compose network.

What it does **not** protect against: SQL injection (though SQLModel uses parameterized queries, so this is mitigated at the ORM layer), a compromised app container (which sits on the same network and has the `DATABASE_URL` in its environment), or anyone with shell access to the host (who can `docker exec` into the db container). It also doesn't protect against our known limitation: the app connects as the Postgres user `app` which has superuser-equivalent privileges on the `app` database — it can `DROP TABLE users` if a code bug or injection somehow constructs that query. A production system would use a least-privilege database role with only `SELECT/INSERT/UPDATE/DELETE` on specific tables.

My DB-layer responsibilities that remain regardless of the network boundary: the OWASP-style 404-for-not-yours rule on `/api/runs/<id>` (§4 — a user must not learn whether another user's run exists), cascade deletes on `saved_runs → tiles/rooms/halls/entities/loot_entries`, the unique constraints (`uq_tile_saved_run_x_y`, `uq_provider_user_id`, etc.), and the `level BETWEEN 1 AND 10` check constraint.

### 5. Rate limiting on auth endpoints

Our nginx config rate-limits three endpoints at **5 requests/minute per IP** with `burst=3 nodelay`:
- `/login` — password authentication
- `/register` — new account creation
- `/login/github` — OAuth initiation

`/auth/github/callback` is deliberately **not** rate-limited. It's hit once per real login as the return leg of the GitHub OAuth round-trip; throttling it risks failing legitimate logins because the user has no control over when GitHub redirects back.

**Too low (e.g., 1 r/m):** A user who mistypes their password twice is locked out for two minutes. With the OAuth flow, the `/login/github` redirect and the subsequent callback both count if they share a rate zone — a single login attempt could consume the entire budget. Our `burst=3` means a user can mistype 3 times in quick succession before hitting the wall, which matches real usage.

**Too high (e.g., 100 r/m):** A brute-force attacker can try 100 passwords per minute per IP, which is enough to crack weak passwords in hours. The rate limit becomes decorative. Our 5 r/m means an attacker gets at most 300 attempts per hour per IP — not viable against even a mediocre password, and easily caught in logs.

The 5 r/m rate is a reasonable default for a project with a small user base. If we had thousands of users behind a shared NAT (like a university campus), we'd need to be more careful — rate-limiting by IP would lock out legitimate users who share an exit IP.

### 6. Have the LLM probe your full security surface

See `llm_probe_dbsec.md` for the full conversation. I pasted our `nginx.conf`, `attack_paths.json`, the `docker-compose.yml`, and described our intended deploy pipeline (tag-driven, secrets in GitHub Actions, no actual workflow built yet).

Key findings and my responses:

**The LLM flagged our `Server` header leaking nginx version.** Correct — we're not suppressing it. I'd add `server_tokens off;` to the nginx config. Low priority for a class project, but it's a free fix.

**It identified that our CSP (`default-src 'self'`) will break inline scripts in `S3_content/index.html`.** We already knew this (documented as an open item in CONTRACTS.md §15.5). Charles needs to either refactor inline code or add nonces. This is the composition problem — my nginx config and Charles's frontend need to agree on the CSP value.

**It pointed out that `attack_paths.json` doesn't cover API-specific paths** like `/api/runs` without auth, or path traversal attempts like `/site/../app.py`. Fair point — our test covers scanner-bot paths but not application-layer attacks. The BOLA 404 rule and `@login_required` handle the auth case, but a path traversal test against nginx's `alias` directive would be worth adding.

**On the deploy surface:** the LLM noted that our `.env` file with real OAuth secrets sits on developer laptops with no rotation policy, and that a hostile collaborator with commit access could modify `docker-compose.yml` to exfiltrate `DATABASE_URL` or `OAUTH_CLIENT_SECRET` via a malicious entrypoint. Both are real risks. The mitigation for the first is secret rotation (which we don't do). The mitigation for the second is branch protection + PR review (which GitHub enforces on `main`).

**What surprised me:** The LLM pointed out that our `POSTGRES_PASSWORD: app` is hardcoded in plain text in `docker-compose.yml`, which is committed to a public repo. Even though the DB has no published ports, anyone who clones the repo knows the credentials. In a real deployment we'd use Docker secrets or an `.env` reference for the DB password too.

### 7. Secrets, in three places

Take `OAUTH_CLIENT_SECRET` — the secret that authenticates our app to GitHub's OAuth API.

**Generated:** On GitHub's developer settings page (`github.com/settings/applications`), when Charles registered our OAuth app. GitHub generates the secret once; if it leaks, you regenerate it there.

**Stored:** In two places: (1) each developer's local `.env` file (gitignored, never committed), and (2) ideally in GitHub Actions secrets for CI/CD (we haven't built the workflow, but `DEPLOY_AWS.md` and CONTRACTS.md §15.9 document this as the intended location).

**Used at runtime:** `app.py` reads it with `os.environ["OAUTH_CLIENT_SECRET"]` (square brackets — crashes on startup if missing). In Docker, it flows from the `.env` file through `env_file:` in `docker-compose.yml` into the container's environment.

**What goes wrong if it leaks to a fourth place:** If someone commits `.env` to the repo (which is why it's in `.gitignore`), the secret is in git history permanently — even deleting the file doesn't purge the old commit. An attacker with the client secret can impersonate our app to GitHub, intercept OAuth authorization codes, and exchange them for access tokens to GitHub user accounts. They could log into our app as any GitHub user and access all their saved dungeon runs. The fix is immediate rotation at the provider (GitHub) and invalidation of all existing tokens.

### 8. Tag-driven releases

**For tag-driven (`on: push: tags: ['v*']`):** You control exactly when a release ships. A developer pushes a tag like `v1.2.0` only after the feature is tested, reviewed, and merged to `main`. This prevents half-finished work from accidentally deploying — a merge to `main` doesn't trigger a deploy unless someone explicitly tags it. For our project, where we merge feature branches frequently and not every merge is deploy-ready (e.g., Charles's `new-frontend` branch was feature work, not a production release), tag-driven is the right fit.

**Against tag-driven:** It adds a manual step. If someone forgets to tag, production stays on the old version even though `main` has the fix. On a team where every merge to `main` *is* supposed to be deploy-ready (continuous deployment), triggering on push to `main` is simpler and ensures production always matches the latest code. For our project this is less relevant because we don't have a live production deployment — but if we did, the risk of forgetting to tag after merging a security patch is real.

### 9. When CI goes red

**First: read the job logs.** GitHub Actions shows which step failed and the exit code. If it's `pytest`, I look at which test failed and the assertion error. If it's a Docker build step, I look for missing dependencies or syntax errors. The log is always the starting point because it shows the *exact* error, not a guess.

**Second: check what changed.** `git log main -5` — what was the last merge? If it's Megan's gunicorn changes and the failure is in `test_attack_paths.py`, the issue is probably that the stack configuration changed and the test environment doesn't match. If it's Charles's CSP change and the failure is in an e2e Playwright test, the CSP is probably blocking a script the test depends on.

**Third: reproduce locally.** Run the same command that CI ran — `docker compose up --build` + `pytest tests/test_attack_paths.py -v`. If it passes locally but fails in CI, the difference is the environment (missing env vars, different Docker version, network policy).

**What I'd ask the LLM:** "Here's the error traceback and the relevant config file — what's the most likely cause?" LLMs are good at pattern-matching error messages to known issues, especially for configuration problems (wrong socket path, missing env var, permissions error).

**What I would NOT ask the LLM:** "Why did this deploy fail?" — because the answer depends on our specific GitHub Actions runner state, our Docker image cache, our `.env` contents, and our branch protection rules. The LLM doesn't have access to our CI environment, our secrets, or the runtime state of our containers. It can interpret an error message, but it can't diagnose why our specific runner timed out or why our specific Docker build cache was stale.
