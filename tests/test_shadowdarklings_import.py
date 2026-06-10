"""
Owner: Backend Role (Megan)
Contract: ShadowDarklings import endpoint returns character JSON payload.

The endpoint is login-gated: it launches a headless browser server-side, so
anonymous access would be a resource-exhaustion (DoS) vector.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("OAUTH_CLIENT_SECRET", "test-client-secret")

import pytest
from sqlmodel import SQLModel, Session

from app import app as flask_app, engine, User


@pytest.fixture
def client():
    """Test client logged in as a real user (Flask-Login `_user_id` convention)."""
    flask_app.config["TESTING"] = True

    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        user = User(username="importer", password_hash="pbkdf2:sha256:...")
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

    with flask_app.test_client() as client:
        with client.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True
        yield client


def test_shadowdarklings_import_requires_login():
    """Anonymous POST is rejected with 401 login_required."""
    flask_app.config["TESTING"] = True
    SQLModel.metadata.create_all(engine)
    with flask_app.test_client() as anon:
        response = anon.post("/api/shadowdarklings/import")
    assert response.status_code == 401
    assert response.get_json()["error"] == "login_required"


def test_shadowdarklings_import_endpoint_returns_copied_json(client, monkeypatch):
    """The import endpoint returns the copied ShadowDarklings JSON string."""

    monkeypatch.setattr(
        "app.fetch_shadowdarklings_character_json",
        lambda: '{"name":"Glazkhar","className":"Basilisk Warrior"}'
    )

    response = client.post("/api/shadowdarklings/import")

    assert response.status_code == 200
    data = response.get_json()
    assert data["source"] == "shadowdarklings"
    assert data["character_json"] == '{"name":"Glazkhar","className":"Basilisk Warrior"}'
    assert data["generated_at"]
