"""E2E-style security access checks for the Week 7 OAuth backend.

This file exercises the test-login backdoor, OAuth initiation redirect,
and the ownership/login gate around saved runs.
"""

import os

os.environ["SECRET_KEY"] = "test-secret"
os.environ["OAUTH_CLIENT_ID"] = "test-client-id"
os.environ["OAUTH_CLIENT_SECRET"] = "test-client-secret"

import pytest
from sqlmodel import SQLModel, Session
from playwright.sync_api import expect

from app import app, engine, User, SavedRun


@pytest.fixture
def seeded_client():
    app.config["TESTING"] = True
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        alice = User(username="alice", password_hash="pbkdf2:sha256:demo")
        bob = User(username="bob", password_hash="pbkdf2:sha256:demo")
        db.add_all([alice, bob])
        db.commit()
        db.refresh(alice)
        db.refresh(bob)

        run = SavedRun(
            user_id=alice.id,
            seed=12345,
            level=3,
            state_json={"player": {"x": 1, "y": 1}},
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        yield app.test_client(), alice.id, bob.id, run.id


def test_github_login_redirect_is_exposed():
    client = app.test_client()
    app.config["TESTING"] = True

    response = client.get("/login/github", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["Location"].startswith("https://github.com/login/oauth/authorize")


def test_test_login_backdoor_logs_user_in(seeded_client):
    client, alice_id, _, _ = seeded_client

    response = client.get("/test/login/alice", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["Location"].endswith("/runs")

    followup = client.get("/runs")
    assert followup.status_code == 200
    assert b"Almost there." in followup.data
    assert b"Back to home." in followup.data


def test_test_login_backdoor_is_disabled_when_testing_off(seeded_client):
    client, _, _, _ = seeded_client
    app.config["TESTING"] = False

    response = client.get("/test/login/alice", follow_redirects=False)

    assert response.status_code == 404


def test_non_owner_still_gets_404_for_other_users_run(seeded_client):
    client, _, bob_id, run_id = seeded_client

    with client.session_transaction() as session_data:
        session_data["_user_id"] = str(bob_id)

    response = client.get(f"/api/runs/{run_id}")

    assert response.status_code == 404


def test_charles_auth_smoke_path(page, live_server):
    """Playwright smoke test for the client-side auth flow."""
    login_url = f"{live_server.url}/login"
    home_url = f"{live_server.url}/"
    backdoor_url = f"{live_server.url}/test/login/charles_smoke"

    page.goto(login_url)
    expect(page.get_by_role("link", name="Sign in with GitHub")).to_be_visible()
    expect(page.get_by_role("textbox", name="Username")).to_be_visible()
    expect(page.get_by_role("textbox", name="Password")).to_be_visible()
    expect(page.get_by_role("checkbox", name="Remember me")).to_be_visible()

    page.goto(backdoor_url)
    expect(page).to_have_url(f"{live_server.url}/runs")
    expect(page.get_by_text("Almost there.")).to_be_visible()

    page.goto(home_url)
    expect(page.get_by_role("navigation").get_by_text("Logged in as charles_smoke", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Log out")).to_be_visible()

    page.get_by_role("button", name="Log out").click()
    expect(page.get_by_role("link", name="Log in")).to_be_visible()
    expect(page.get_by_role("link", name="Register")).to_be_visible()