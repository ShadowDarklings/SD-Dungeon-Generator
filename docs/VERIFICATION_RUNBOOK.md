# Verification Runbook — Live-Stack Security & Integration Checks

Companion to `SECURITY_ASSESSMENT.md` §4/§5. Run top to bottom on a machine with
Docker; everything here is the part of the assessment that can't run statically.
Check items off as you go.

## 0. Prerequisites (once)

```shell
cp .env.example .env          # fill in SECRET_KEY, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout nginx/certs/key.pem -out nginx/certs/cert.pem \
  -days 365 -subj "/CN=localhost"
pip install -r requirements.txt
playwright install chromium   # for the e2e suite (host-side, not the prod image)
```

## 1. Stack comes up clean

```shell
docker compose up --build -d
docker compose ps
```

- [ ] Three containers running: nginx, app, db
- [ ] `docker compose logs app | tail` shows gunicorn workers booted, no tracebacks
- [ ] `curl -k https://localhost/healthz` returns `{"status":"ok","database":"ok"}`
- [ ] `https://localhost` loads (accept the self-signed warning)
- [ ] `http://localhost` 301-redirects to https

## 2. Attack-path suite (nginx blocking)

```shell
pytest tests/test_attack_paths.py -v
```

- [ ] All 20 paths return 404/403 (none skipped now that the stack is up)

## 3. Full test suite inside the container

```shell
docker compose exec app pytest -v --ignore=tests/e2e
```

- [ ] 40 passed — this exercises Postgres, not SQLite, for the unit/contract tests

## 4. Playwright e2e (host-side)

```shell
pytest tests/e2e -v
```

- [ ] Full lifecycle, security access, and server login tests pass

## 5. Manual browser checks (5 minutes, DevTools open)

On `https://localhost`:

- [ ] **CSP:** Console shows zero CSP violation errors on `/`, `/login`, `/runs`,
      `/site/` (play a few moves), and `/about`. Bootstrap styling renders
      (jsdelivr allowed), game canvas works.
- [ ] **Cookies:** After login, DevTools → Application → Cookies: `session` has
      Secure + HttpOnly + SameSite=Lax. With "remember me" checked, a
      `remember_token` cookie appears with the same flags.
- [ ] **Headers:** `curl -kI https://localhost` shows HSTS, X-Frame-Options,
      nosniff, Referrer-Policy, Permissions-Policy, CSP.
- [ ] **Rate limit:** 8 rapid wrong-password logins → some requests get 503
      (nginx `limit_req`). `/auth/github/callback` is NOT throttled.
- [ ] **Shadowdarklings import:** in the game, character import shows the
      "not available in this environment" message (prod = disabled), not a 502.

## 6. Multiplayer smoke (two browsers / one incognito)

- [ ] Browser A (logged in): create host session via the modal → invite link shown
- [ ] Browser B (different account): open invite link → modal opens prefilled → join works
- [ ] Browser B cannot assign dots (UI may show controls; request must fail)
- [ ] Browser A assigns a dot to B → visible in B after refresh
- [ ] Logged-out browser: invite link prompts login, API returns 401
- [ ] Garbage code (`/site/?session=zzz` → join) → clean "not found" error, no stack trace

## 7. Post-deploy (re-run on the real URL before Canvas submission)

- [ ] Steps 2, 5, 6 against the production URL
- [ ] Real certificate (or documented decision) — graders shouldn't fight cert warnings
- [ ] `server_name` in nginx.conf set to the real domain (closes the Host-header
      nit in SECURITY_ASSESSMENT.md §4.3)
- [ ] OAuth callback URL updated in the GitHub OAuth app settings
- [ ] `docker compose exec db psql -U app -c "\dt"` shows all 10 tables on prod Postgres

## 8. Teardown

```shell
docker compose down        # add -v to also wipe pgdata
```

When every box is checked, the SECURITY_ASSESSMENT.md "not done" list is closed
and the assessment is complete for submission.
