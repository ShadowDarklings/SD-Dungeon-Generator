# Role Work — Charles (Client Side)

**Week:** 7  
**Role:** Client Side  
**Team:** ShadowDarklings

---

## Files Touched

| File | What Changed |
|------|-------------|
| `templates/base.html` | Updated the shared navbar so logged-in users see `Logged in as <username>` plus a POST logout button, while anonymous users see Log in / Register links. |
| `templates/home.html` | Reworked the home hero and layout so the merged front page clearly points users to `/site/` and `/about`, and shows the current auth state. |
| `templates/login.html` | Kept the password login form, added the GitHub sign-in button, and added the remember-me checkbox. |
| `templates/register.html` | Updated the registration page copy so it matches the new auth flow and branding. |
| `static/css/styles.css` | Added the auth/home layout styling, hero banner treatment, brand typography tweaks, and responsive spacing changes. |
| `tests/e2e/test_security_access.py` | Added `test_charles_auth_smoke_path`, the Playwright smoke test for the auth UI flow. |
| `requirements.txt` | Added Playwright dependencies so the browser smoke test can run. |

---

## What My Playwright Test Verifies

My Playwright test is `tests/e2e/test_security_access.py::test_charles_auth_smoke_path`. It exercises one user-visible auth path in a real browser:

1. Open `/login` and confirm the GitHub button, username field, password field, and remember-me checkbox are visible.
2. Log in through the `TESTING`-only test-login backdoor.
3. Confirm the home page navbar shows `Logged in as charles_smoke`.
4. Confirm the logout button is visible and clickable.
5. Log out and confirm the UI returns to the anonymous state with Log in and Register links.

This test is not adapted from a Week 6 walkthrough; it was written fresh for the Week 7 browser requirement.

**Regressions this test would catch:**
- Removing the GitHub button from the login page.
- Breaking the remember-me or password form markup on the login page.
- Breaking the test-login backdoor or the live-server test harness.
- Losing the logged-in navbar state after authentication.
- Breaking logout so the page does not return to the anonymous state.

---

## Known Gaps

- **The test does not drive the actual GitHub OAuth redirect.** The test-login backdoor stands in for everything after `/login/github` redirects away and back.
- **The smoke test uses the live test harness, not production OAuth credentials.** That is intentional so it can run in CI without real secrets.
- **The smoke test does not verify session lifetime or remember-me persistence across restarts.** Those behaviors belong in the group lifecycle suite.
- **The smoke test does not check the dungeon `/site/` page.** This role work is limited to the auth-facing UI shell.
