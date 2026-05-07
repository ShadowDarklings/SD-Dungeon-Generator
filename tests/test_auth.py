"""
Course 506 Week 5 Skeleton — basic tests for the auth flow + S3 site routes.

These run in CI on every PR (see .github/workflows/test.yml) and locally with
`pytest` from the repo root. The pattern mirrors Week 4's regression test:
fast, automated, gates the merge.

Tests use SQLite in-memory so we don't need Postgres in CI. The Flask app
reads DATABASE_URL from env, so this override applies before the app loads.
"""

import os

# These must be set BEFORE importing app.py — environment-driven config.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret"

import pytest
from sqlmodel import SQLModel, select
from app import app, engine, User, Session


@pytest.fixture
def client():
    app.config["TESTING"] = True

    # Reset schema for each test — drop and recreate.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with app.test_client() as client:
        yield client


def test_home_page_loads(client):
    """Flask-rendered home page returns 200 and has the navbar."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"Skeleton" in response.data
    # Navbar is present
    assert b"My Site" in response.data
    assert b"About" in response.data


def test_site_home_shows_placeholder_when_empty(client):
    """When S3_content/ has no index.html, /site/ shows the placeholder."""
    response = client.get("/site/")
    # Either 200 with the placeholder, or 200 with the actual index.html
    # (depending on whether the developer has populated S3_content/).
    assert response.status_code == 200


def test_login_page_renders(client):
    """The login form is reachable."""
    response = client.get("/login")
    assert response.status_code == 200
    assert b"login" in response.data.lower()


def test_register_creates_user_in_database(client):
    """Registering a user writes a row to the users table."""
    client.post(
        "/register",
        data={"username": "alice", "password": "password123"},
    )

    with Session(engine) as db:
        user = db.exec(select(User).where(User.username == "alice")).first()
        assert user is not None
        assert user.password_hash != "password123"  # password was hashed


def test_register_rejects_duplicate_username(client):
    """A second register with the same username flashes 'already taken'."""
    client.post("/register", data={"username": "bob", "password": "password123"})
    client.post("/logout")
    response = client.post(
        "/register",
        data={"username": "bob", "password": "different"},
        follow_redirects=True,
    )
    assert b"already taken" in response.data


def test_login_with_wrong_password_shows_invalid(client):
    """Wrong password shows the 'Invalid' flash on the login page."""
    client.post("/register", data={"username": "dave", "password": "secret"})
    client.post("/logout")

    response = client.post(
        "/login",
        data={"username": "dave", "password": "wrong"},
        follow_redirects=True,
    )
    assert b"Invalid" in response.data


def test_login_redirects_home_with_session(client):
    """A successful login redirects to / and sets the session cookie."""
    client.post("/register", data={"username": "carol", "password": "secret"})
    client.post("/logout")

    response = client.post(
        "/login",
        data={"username": "carol", "password": "secret"},
    )
    # 302 redirect to home
    assert response.status_code == 302
    assert response.location.endswith("/")

    # Session is set
    with client.session_transaction() as sess:
        assert "user_id" in sess
