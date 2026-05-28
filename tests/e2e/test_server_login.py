"""
Megan's Individual Work - Playwright Login Test

Verifies that hitting the QA automated backdoor test login endpoint
properly assigns a session token, bypasses real provider prompts,
and successfully handles landing redirects.
"""

from playwright.sync_api import sync_playwright, expect


def test_server_backdoor_login_lifecycle(live_server):
    """Playwright smoke test for the server-side backdoor login flow."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # 1. Arrange: Define a unique test user
        test_username = "megan_qa_tester"

        # 2. Act: Direct the browser to the QA backdoor route
        page.goto(f"{live_server.url}/test/login/{test_username}")

        # 3. Assert: Verify redirect to /runs after login
        expect(page).to_have_url(f"{live_server.url}/runs")

        # 4. Assert: Verify logged-in state is visible
        expect(page.locator("body")).to_contain_text(f"Logged in as {test_username}")

        browser.close()