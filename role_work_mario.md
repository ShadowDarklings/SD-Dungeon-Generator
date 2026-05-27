# Role Work — Mario (DB & Security)

**Week:** 7  
**Role:** Database & Security  
**Team:** ShadowDarklings

---

## Files Touched

| File | What Changed |
|------|-------------|
| `app.py` | Added `OAuthIdentity` SQLModel table (§1). Updated `User` model: `password_hash` is now nullable, added `email` (unique, nullable) and `display_name` (nullable). Added session hardening config: `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SAMESITE='Lax'`, `SESSION_COOKIE_SECURE` (conditional), `PERMANENT_SESSION_LIFETIME` (2 hours), `REMEMBER_COOKIE_DURATION` (14 days). Wired Flask-WTF `CSRFProtect` with a `before_request` hook that enforces CSRF on form POSTs but exempts `/api/*` routes. Added the test-login backdoor route `/test/login/<username>` guarded by `TESTING` flag. |
| `templates/login.html` | Added `csrf_token()` hidden input to the login form. |
| `templates/register.html` | Added `csrf_token()` hidden input to the register form. |
| `templates/base.html` | Added `csrf_token()` hidden input to the logout form in the navbar. |
| `requirements.txt` | Added `Flask-WTF==1.2.1`, `playwright==1.40.0`, `python-dotenv==1.0.0`, `Authlib==1.3.0`. |
| `tests/e2e/conftest.py` | Created the Playwright test fixture: threaded live Flask server with `TESTING=True`, SQLite test DB, `SESSION_COOKIE_SECURE=False`. |
| `tests/e2e/test_security_access.py` | Created the individual Playwright test (see below). |

---

## What My Playwright Test Verifies

My test (`tests/e2e/test_security_access.py::test_protected_page_access_control`)
verifies the full login/logout access-control cycle through a real Chromium
browser. It exercises one user-visible behavior in five steps:

1. A logged-out user navigates to `/runs` (a protected page) and is redirected
   to `/login`. The test asserts the `<h1>` heading says "Log in" and the URL
   contains `/login`.

2. The user hits the test-login backdoor (`/test/login/securitytester`), which
   creates a test user and calls `login_user()`.

3. The user navigates to `/runs` again — this time the page loads without
   redirecting. The navbar shows the logged-in username.

4. The user clicks the "Log out" button in the DOM (a real form POST with a
   CSRF token).

5. The user navigates to `/runs` a final time — they're redirected back to
   `/login`, confirming the session was cleared.

This test is not adapted from a Week 6 walkthrough because Week 6 did not
include browser-driven tests. It was written fresh for the Playwright
requirement.

**Regressions this test would catch:**
- Removing `@login_required` from the `/runs` route (Step 1 would fail to redirect)
- Breaking `logout_user()` so the session isn't cleared (Step 5 would not redirect)
- A misconfigured session cookie that doesn't persist after the backdoor login (Step 3 would redirect unexpectedly)
- Removing the CSRF token from the logout form (Step 4's POST would be rejected by Flask-WTF)

---

## Known Gaps

- **The test does not drive the actual GitHub OAuth redirect.** The test-login
  backdoor stands in for everything after `authorize_redirect`. The real
  GitHub redirect was verified manually once during initial wiring.

- **SQLite vs. Postgres.** The e2e test fixture uses SQLite, not the Postgres
  instance used in production and `docker compose`. Postgres-specific behaviors
  (JSON operators, constraint semantics, transaction isolation) are not
  exercised by this test.

- **`SESSION_COOKIE_SECURE` is disabled in tests.** The live test server runs
  over HTTP, so the `Secure` flag must be `False`. This means the test cannot
  verify that cookies are restricted to HTTPS in production.

- **CSRF is tested indirectly.** The logout button click exercises the
  happy-path CSRF flow (the form includes a valid token). A dedicated test
  for CSRF rejection (tokenless POST → 400) lives in the Part 3 group suite
  (`test_full_lifecycle.py`), not in this individual test.

- **"Remember me" is not tested.** The session lifetime and remember-me cookie
  duration are configured but not exercised in this test. Session expiry is
  covered in the Part 3 group suite.
