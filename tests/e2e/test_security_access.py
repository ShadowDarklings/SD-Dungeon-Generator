"""
DB & Security Playwright test (Week 7, Part 2).

Verifies that a protected page is:
1. Inaccessible without login (user is redirected to /login)
2. Accessible after login via the test-login backdoor
3. Inaccessible again after logout

This test exercises real user-visible behavior through the rendered DOM,
not Flask's internal test client. It would catch regressions such as:
- Removing @login_required from a protected route
- Breaking logout_user() so the session isn't cleared
- A misconfigured redirect that sends logged-out users to the wrong page
"""

import re
from playwright.sync_api import sync_playwright, expect


def test_protected_page_access_control(live_server):
    """Protected page: blocked → login → accessible → logout → blocked."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        # ------------------------------------------------------------------
        # Step 1: Without login, /runs should redirect to /login
        # ------------------------------------------------------------------
        page.goto(f"{live_server.url}/runs")
        # After redirect, the login form should be visible
        expect(page.locator("h1")).to_contain_text("Log in")
        assert "/login" in page.url, f"Expected redirect to /login, got {page.url}"

        # ------------------------------------------------------------------
        # Step 2: Log in via the test backdoor
        # ------------------------------------------------------------------
        page.goto(f"{live_server.url}/test/login/securitytester")
        # After login, we should be on the home page and see the username
        page.wait_for_url(f"{live_server.url}/")
        # The navbar should show the logged-in user's name
        expect(page.locator("nav")).to_contain_text("securitytester")

        # ------------------------------------------------------------------
        # Step 3: Protected page should now be accessible
        # ------------------------------------------------------------------
        page.goto(f"{live_server.url}/runs")
        # Should NOT redirect to /login anymore
        assert "/login" not in page.url, "Protected page still redirecting after login"

        # ------------------------------------------------------------------
        # Step 4: Log out via the logout form
        # ------------------------------------------------------------------
        page.locator("button:has-text('Log out')").click()
        page.wait_for_load_state("networkidle")

        # ------------------------------------------------------------------
        # Step 5: Protected page should be inaccessible again
        # ------------------------------------------------------------------
        page.goto(f"{live_server.url}/runs")
        expect(page.locator("h1")).to_contain_text("Log in")
        assert "/login" in page.url, f"Expected redirect to /login after logout, got {page.url}"

        browser.close()
