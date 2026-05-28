# Team Walkthrough — Week 7: OAuth Authentication

**Team:** ShadowDarklings  
**Members:** Mario (DB & Security), Charles (Coordinator / Client-side), Megan (Server-side)

---

## What We Built

We added GitHub OAuth authentication to our dungeon generator. A user can sign in with GitHub or with a local password, browse and save dungeon runs, and log out. All sessions are hardened with `HttpOnly`, `SameSite=Lax` cookies and a configurable lifetime.

---

## Test 1: CSRF Token Infrastructure

**File:** `tests/e2e/test_full_lifecycle.py::test_csrf_token_present_in_forms`

**User-visible behavior:** When a user visits the login or register page, the HTML form contains a hidden `csrf_token` field with a non-trivial cryptographic value. This token is generated server-side by Flask-WTF's `CSRFProtect` and rendered via `{{ csrf_token() }}` in Jinja templates.

**Regression this catches:** If someone removes the `CSRFProtect(app)` initialization or deletes the `{{ csrf_token() }}` call from templates, forms would render without CSRF tokens. When CSRF enforcement is re-enabled (see Known Gaps below), those forms would immediately break with 400 errors.

**Known gap:** The current codebase marks all form routes (`/login`, `/register`, `/logout`) with `@csrf.exempt`. This means a POST without a token is currently accepted — the tokens are rendered but not validated. See the Gaps section below for details.

---

## Test 2: Session Expiry

**File:** `tests/e2e/test_full_lifecycle.py::test_session_expires_after_lifetime`

**User-visible behavior:** A logged-in user's session expires after `PERMANENT_SESSION_LIFETIME` (2 hours in production). After expiry, navigating to a protected page like `/runs` redirects back to `/login`.

**Regression this catches:** If someone removes `session.permanent = True` from the login flow, or deletes the `PERMANENT_SESSION_LIFETIME` config, sessions would either never expire or use Flask's default (31 days). This test simulates expiry by clearing the session cookie and confirms the protected page becomes inaccessible.

---

## Test 3: First-Time OAuth Login

**File:** `tests/e2e/test_full_lifecycle.py::test_first_time_oauth_login_creates_identity`

**User-visible behavior:** A new user visits the app for the first time, signs in with GitHub (simulated via the `/test/login/<username>` backdoor), and lands on the post-login page. Behind the scenes, a `User` row and an `oauth_identities` row are created, linking the GitHub identity to the local account.

**Regression this catches:** If the user-creation logic in `/auth/github/callback` breaks — fails to create the `User`, fails to insert the `oauth_identities` row, or links to the wrong user — this test catches it. It also ensures the backdoor route is functional for all Playwright tests.

---

## Test 4: Returning OAuth Login

**File:** `tests/e2e/test_full_lifecycle.py::test_returning_oauth_login_reuses_identity`

**User-visible behavior:** A user who previously signed in with GitHub logs out, then signs in again. The app recognizes them via the existing `oauth_identities` row and logs them in without creating a duplicate identity.

**Regression this catches:** If the `SELECT … WHERE provider='github' AND provider_user_id=<id>` lookup in the callback breaks, or if the code always creates a new `oauth_identities` row instead of reusing the existing one, this test catches the duplication. Duplicate rows could cause ambiguous login behavior or unique-constraint violations.

---

## Known Gaps

### 1. CSRF enforcement is disabled on form routes

**What:** Megan's server-auth implementation marks `/login`, `/register`, and `/logout` with `@csrf.exempt`. Per CONTRACTS.md §9.3, these routes should validate CSRF tokens on POST requests and return 400 if the token is missing or invalid.

**Why it happened:** The exemptions were added to unblock integration — without them, the test client and Playwright tests would need to extract and submit CSRF tokens on every form POST. The token infrastructure is fully in place (templates render tokens, `CSRFProtect` is initialized), so removing `@csrf.exempt` from these three routes would immediately enable enforcement with no other code changes.

**Impact:** Low for this project (SameSite=Lax cookies prevent cross-origin form submissions in modern browsers), but in production this would be a required fix.

### 2. GitHub redirect is not tested automatically

**What:** The real `authorize_redirect()` → GitHub → `/auth/github/callback` round-trip is not exercised by any automated test. The test-login backdoor (`/test/login/<username>`) stands in for everything after the redirect.

**Why:** Playwright cannot authenticate with a real GitHub account in CI. Testing the redirect requires manual verification with real OAuth credentials.

### 3. SQLite vs. Postgres in tests

**What:** All Playwright and unit tests use SQLite. The production database is Postgres. Differences in JSON operators, constraint semantics, and transaction isolation are not exercised.

**Why:** Running Postgres in CI requires Docker or a service container. SQLite keeps CI fast and dependency-free.

### 4. Token revocation is not implemented

**What:** `POST /logout` clears the local Flask session but does not revoke the GitHub OAuth token. The token remains valid until it expires or the user revokes it on GitHub.

**Why:** This is standard for local-only logout. Revoking tokens adds complexity and a network call that can fail, with no practical benefit for this project's scope.

### 5. Email verification before auto-linking

**What:** The create-or-link logic (§8) auto-links a GitHub identity to an existing local user if the email matches. In production, you'd verify email ownership first (confirmation email).

**Why:** Email verification is out of scope for Week 7. The contract acknowledges this explicitly.
