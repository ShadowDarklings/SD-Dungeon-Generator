# Security Assessment — SD Dungeon Generator

**Date:** 2026-06-11
**Assessor:** Mario (DB/security role), AI-assisted
**Scope:** `main` post-rebase (PR #17 merged) plus the Final Project hardening pass landed with this assessment.
**Method:** Static review of `app.py`, `nginx/nginx.conf`, `docker-compose.yml`, `gunicorn.conf.py`, `Dockerfile`, templates, and `S3_content/`; contract conformance check against CONTRACTS.md §§4, 9, 15, 16; full unit/contract test run. The live-stack attack-path suite (`tests/test_attack_paths.py`, 20 scanner paths) requires `docker compose up` and was not run in this environment — run it before the deployment is submitted.

## 1. Summary

The application's security posture is in line with the course contract and OWASP-for-scope expectations. All previously identified findings are fixed and regression-tested. The new multiplayer feature shipped in this pass with its §16 security model implemented and tested (11 dedicated security tests). Test suite: **40 passed, 21 skipped** (the skips are live-stack attack-path tests).

## 2. Findings fixed in this pass

| Finding | Severity | Fix | Test |
|---|---|---|---|
| Multiplayer endpoints did not exist while the frontend shipped; no auth model existed for invite links | High (had it shipped unreviewed) | Implemented per §16: login required, host-only assignment, 404-for-everything-unauthorized, `secrets.token_urlsafe(16)` invite codes, player/session caps, lazy stale-session closure | `tests/test_security_multiplayer.py` (11 tests, full §16.9 checklist) |
| Shadowdarklings import 502s in production and runs a headless browser on request | Medium | Dev-only feature flag — clean 503 `feature_disabled` in production; remains login-gated everywhere | `test_shadowdarklings_import_disabled_in_production` |
| `style-src 'unsafe-inline'` no longer needed after about.html externalized its styles | Low | Dropped from CSP; `script-src` remains strictly `'self'` | Manual conf review |
| No rate limiting on multiplayer create/join (invite-code guessing surface) | Medium | nginx `limit_req` (auth zone, 5 r/m burst=3) on session create and join; presence polling GET deliberately unthrottled | Conf review; behavior verifiable on live stack |
| "Remember me" checkbox not wired (session-lifetime contract §9.2 partially inert) | Low | `login_user(user, remember=...)` wired to the form | `test_login_remember_me_sets_remember_cookie` |
| Random-tables proxy used retired two-table mapping (contract drift) | Info | Per-level `monsters-N.json` per revised §3a; S3 bucket spot-verified live | `test_backend_proxy_serves_per_level_tables` |

Fixed in the previous pass and still in place (regression-tested): CSRF enforcement on all form routes, table-creation ordering, parametrized ORM deletes, level validation, BOLA/ownership 404 rules.

## 3. Posture by area

**Authentication & sessions.** Flask-Login with `_user_id` convention; passwords hashed (Werkzeug); OAuth-only accounts have NULL password hashes and reject password login; cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production behind ProxyFix; 2h sessions, 14-day opt-in remember-me. Test backdoor 404s outside `TESTING`.

**Authorization.** Ownership checks on every saved-run and multiplayer resource return 404 (never 403) for not-yours, per the §4 anti-enumeration rule. Multiplayer adds role-based rules: non-members and non-host members are indistinguishable from "session doesn't exist". Verified by `test_unknown_code_and_non_member_get_identical_404` (byte-identical envelopes).

**CSRF.** Form routes (`/login`, `/register`, `/logout`) enforce tokens (400 `csrf_invalid`). The 7 `@csrf.exempt` routes are all JSON-only APIs protected by `SameSite=Lax` + content-type, per the documented §9.3 rationale.

**Injection.** All persistence goes through SQLModel/SQLAlchemy parametrized statements; the one raw-SQL site was removed last pass. No `eval`/`exec`/`os.system`/shell-outs. Jinja autoescaping is on (no `|safe` usage). The random-tables proxy validates `type` against an allowlist and `level` as a bounded int before URL construction — no SSRF surface.

**Transport & headers.** nginx terminates TLS (1.2/1.3), HTTP→HTTPS redirect, HSTS, `X-Frame-Options DENY` + `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, and a CSP with `script-src 'self'` and no inline anything. Postgres has no host port mapping (trust boundary per §15.8).

**Abuse/DoS.** Auth endpoints and multiplayer create/join are rate-limited at nginx. Multiplayer caps: 8 players/session, 5 open sessions/host, 24h stale-closure. The headless-browser endpoint is disabled in production. nginx's default 1MB `client_max_body_size` bounds `state_json` payloads.

**Secrets.** No secrets in the repo (verified by grep); `.env` gitignored, `.env.example` documents names; `os.environ["KEY"]` crash-on-missing pattern.

**Privacy.** Multiplayer session payloads expose only player-row id, display name, role, and assigned character — tested that email/password/OAuth fields never serialize.

## 4. Residual risks (accepted / tracked)

1. **Postgres superuser** — the app connects as `app` superuser, not a least-privilege role (§15.11, known limitation; acceptable for course scope).
2. **Self-signed certificate** — fine for `https://localhost`; the graded deployment needs a real cert or documented browser-warning acceptance (final assignment expects HTTPS at a live URL).
3. **`invite_url` derives from `request.url_root`** — behind our nginx the Host header is forwarded as-is. A spoofed Host could distort the convenience URL in a response (not an auth bypass — the code itself is the credential). Mitigate by setting an explicit `server_name` + default-server catch-all in nginx for the production domain.
4. **Host-authoritative multiplayer state** — by §16.7 design, no per-action validation exists yet; non-host players cannot write state at all, which contains the risk until validated action endpoints are built.
5. **e2e gap** — Playwright suite runs over HTTP/SQLite; Secure-cookie and Postgres-specific behavior aren't e2e-exercised (§15.11).
6. **Attack-path suite not CI-gated** — runs only against a live stack; run manually pre-submission.

## 4a. Addendum — post-PR #23 re-review (2026-06-12)

PR #23 replaced `@login_required` on `/api/shadowdarklings/import` with a manual auth check plus a
documented local-dev bypass (`ALLOW_ANON_SHADOWDARKLINGS_IMPORT=1`, see AGENTS.md). Reviewed and
**accepted with conditions**: the variable is absent from `docker-compose.yml` and commented out in
`.env.example`, the production feature gate (503 `feature_disabled`) fires before the auth check
regardless, and both behaviors are regression-tested (`test_shadowdarklings_import_requires_login`,
`test_shadowdarklings_import_allows_explicit_local_dev_bypass`). Contract §2 updated to record the
bypass. Residual risk: a misconfigured non-production deployment that sets both
`SHADOWDARKLINGS_IMPORT_ENABLED=1` and the bypass would expose the headless-browser DoS surface
anonymously — deployment checklists must treat both variables as dev-only. PR #20/#23 frontend
surfaces (new state fields, `innerHTML` usage, `display_name` rendering, CSP) re-checked clean.

## 5. Evidence

- `pytest tests/ --ignore=tests/e2e` → 40 passed, 21 skipped (2026-06-11).
- §16.9 checklist: all 9 items have a named test in `tests/test_security_multiplayer.py`, plus both §16.6 caps.
- S3 bucket sync spot-verified: `monsters-3.json` serves the full level-3 table from the live bucket.
- Secrets/debug/injection greps: clean (no matches for committed secrets, `debug=True`, `eval/exec/system`, or f-string SQL).
