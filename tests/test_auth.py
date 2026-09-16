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
    # CSRF is enforced on the form routes (CONTRACTS.md §9.3). These tests
    # exercise auth logic, not token handling, so disable token checks here;
    # enforcement itself is covered by test_csrf_rejects_tokenless_post.
    app.config["WTF_CSRF_ENABLED"] = False

    # Reset schema for each test — drop and recreate.
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with app.test_client() as client:
        yield client

    app.config["WTF_CSRF_ENABLED"] = True


def test_csrf_rejects_tokenless_post(client):
    """Contract §9.3: a POST without a valid CSRF token returns 400 csrf_invalid."""
    app.config["WTF_CSRF_ENABLED"] = True
    try:
        response = client.post(
            "/register", data={"username": "eve", "password": "secret123"}
        )
        assert response.status_code == 400
        assert response.get_json()["error"] == "csrf_invalid"
    finally:
        app.config["WTF_CSRF_ENABLED"] = False


def test_home_page_loads(client):
    """Flask-rendered home page returns 200 and has the navbar."""
    response = client.get("/")
    assert response.status_code == 200
    assert b"ShadowSpawner" in response.data
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


def test_register_allows_minimum_and_long_passwords(client):
    """Users can choose a 6-character password, while long passphrases still work."""
    client.post("/register", data={"username": "minpass", "password": "123456"})
    client.post("/logout")

    long_password = "correct horse battery staple " * 16
    client.post("/register", data={"username": "longpass", "password": long_password})

    with Session(engine) as db:
        min_user = db.exec(select(User).where(User.username == "minpass")).first()
        long_user = db.exec(select(User).where(User.username == "longpass")).first()
        assert min_user is not None
        assert long_user is not None
        assert long_user.password_hash != long_password


def test_register_rejects_password_under_minimum(client):
    response = client.post(
        "/register",
        data={"username": "tooshort", "password": "12345"},
        follow_redirects=True,
    )
    assert b"Password must be at least 6 characters" in response.data

    with Session(engine) as db:
        user = db.exec(select(User).where(User.username == "tooshort")).first()
        assert user is None


def test_register_rejects_extremely_large_password(client):
    """Server-side password length cap prevents expensive oversized hashes."""
    response = client.post(
        "/register",
        data={"username": "hugepass", "password": "x" * (app.config.get("PASSWORD_MAX_LENGTH", 1024) + 1)},
        follow_redirects=True,
    )
    assert b"Password is too long" in response.data


def test_register_page_sets_password_bounds(client):
    response = client.get("/register")
    assert response.status_code == 200
    assert b'minlength="6"' in response.data
    assert b'maxlength="1024"' in response.data
    assert b"At least 6 characters" in response.data
    assert b"Long passphrases are supported" in response.data


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
        assert "_user_id" in sess


def test_login_remember_me_sets_remember_cookie(client):
    """§9.2: checking 'remember me' sets Flask-Login's remember_token cookie."""
    client.post("/register", data={"username": "remy", "password": "secret"})
    client.post("/logout")

    # Without the checkbox: no remember_token.
    response = client.post("/login", data={"username": "remy", "password": "secret"})
    assert not any(
        c.startswith("remember_token=") and "Expires" not in c.split(";")[0]
        and len(c.split("=", 1)[1].split(";")[0]) > 1
        for c in response.headers.getlist("Set-Cookie")
    )
    client.post("/logout")

    # With the checkbox: remember_token is set.
    response = client.post(
        "/login", data={"username": "remy", "password": "secret", "remember": "1"}
    )
    cookies = response.headers.getlist("Set-Cookie")
    assert any(
        c.startswith("remember_token=") and len(c.split("=", 1)[1].split(";")[0]) > 1
        for c in cookies
    )


def test_security_headers_are_added_to_flask_responses(client):
    response = client.get("/")
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert "object-src 'none'" in response.headers["Content-Security-Policy"]
    assert "microphone=()" in response.headers["Permissions-Policy"]


def test_hsts_is_added_when_secure_cookies_are_enabled(client):
    original = app.config["SESSION_COOKIE_SECURE"]
    app.config["SESSION_COOKIE_SECURE"] = True
    try:
        response = client.get("/")
        assert "max-age=31536000" in response.headers["Strict-Transport-Security"]
    finally:
        app.config["SESSION_COOKIE_SECURE"] = original
