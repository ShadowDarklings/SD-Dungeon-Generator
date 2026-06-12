# EC2 Deployment Verification Report

**Target:** `https://54.191.130.99`
**Date:** 2026-06-11
**Commit:** `cb1aa1f` (main)

## Automated Tests (on EC2)

```
60 passed, 1 skipped in 4.07s
```

All test suites green — attack paths, auth, CSRF, multiplayer security (§16.9), BOLA ownership, schema constraints, random-table proxy, shadowdarklings, and frontend UI controls.

---

## Manual Verification Checklist

### Runbook §1 — Stack comes up clean

| Check | Result |
|---|---|
| Three containers running (nginx, app, db) | ✅ PASS |
| Gunicorn workers booted, no tracebacks | ✅ PASS (4 workers) |
| `https://54.191.130.99` loads | ✅ PASS |
| `http://` → 301 redirect to HTTPS | ✅ PASS |

### Runbook §2 — Attack paths (nginx blocking)

| Check | Result |
|---|---|
| 20 scanner paths blocked (404/403) | ✅ PASS |

### Runbook §5 — Manual browser checks

| Check | Result | Notes |
|---|---|---|
| **CSP:** No console violations on `/`, `/login`, `/runs`, `/about` | ✅ PASS | `style-src` violations appear on `/site/` due to inline styles in the game canvas JS — gameplay unaffected |
| **Cookies:** `session` has Secure + HttpOnly + SameSite=Lax | ✅ PASS | |
| **Cookies:** `remember_token` appears with "Remember me" checked | ✅ PASS | |
| **Headers:** HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, CSP | ✅ PASS | All present |
| **Rate limit:** Rapid login attempts → 503 | ✅ PASS | Confirmed via curl |
| **Shadowdarklings import:** Returns `login_required` (not 502) | ✅ PASS | Clean 401 JSON |

### Runbook §5 — Page rendering

| Page | Result | Notes |
|---|---|---|
| `/` (home) | ✅ PASS | Loads with nav, login/register links |
| `/login` | ✅ PASS | Form with username, password, remember-me checkbox |
| `/register` | ✅ PASS | Registration works, auto-login on success |
| `/runs` | ✅ PASS | Loads (requires auth) |
| `/site/` (game) | ✅ PASS | Canvas renders, dungeon generates, fog-of-war works |
| `/site/about.html` | ✅ PASS | Bootstrap styling renders correctly |
| `/logout` | ✅ PASS | Session cleared, API returns 401 after |

### Game page screenshot (torch lit, fog-of-war active)

![Game page with dungeon generated and torch lit](/Users/mario/.gemini/antigravity-ide/brain/90a36f63-c2f9-4af3-9c00-a8648fe865ca/game_page_torch_lit_1781203498000.png)

### Browser recording of the full verification flow

![EC2 manual verification recording](/Users/mario/.gemini/antigravity-ide/brain/90a36f63-c2f9-4af3-9c00-a8648fe865ca/cookie_and_login_check_1781203370395.webp)

---

## Security Headers (full response)

```
HTTP/2 200
strict-transport-security: max-age=31536000
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; ...
permissions-policy: camera=(), microphone=(), geolocation=(), payment=()
```

## Known Item

> [!NOTE]
> The game page (`/site/`) generates `style-src` CSP violations in the console because the canvas JS uses inline styles for dynamic element positioning. This does **not** break functionality — the game renders and plays correctly. The CSP intentionally does not add `'unsafe-inline'` to `style-src` since that would weaken protection for all other pages.

## Verdict

**All runbook checks PASS.** The deployment is ready for submission.
