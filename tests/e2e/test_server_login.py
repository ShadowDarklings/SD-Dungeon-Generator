import pytest
from playwright.sync_api import Page, expect

def test_server_backdoor_login_lifecycle(page: Page):
    """
    Megan's Individual Work - Playwright Login Test
    
    Verifies that hitting the QA automated backdoor test login endpoint
    properly assigns a session token, bypasses real provider prompts,
    and successfully handles landing redirects.
    """
    # 1. Arrange: Define a unique test user
    test_username = "megan_qa_tester"
    
    # 2. Act: Direct the browser instance to strike our QA backdoor route
    page.goto(f"/test/login/{test_username}")
    
    # 3. Assert: Verify the app successfully processed authentication and redirected
    expect(page).to_have_url(list_runs_page_regex := r".*/runs")
    
    # 4. Assert: Verify Mario's exact text requirement is present in the DOM state
    navbar_user_element = page.locator("body")
    expect(navbar_user_element).to_contain_text(f"Logged in as {test_username}")