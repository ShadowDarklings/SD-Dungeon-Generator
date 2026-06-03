"""
Owner: Backend Role (Megan)
Contract: ShadowDarklings import endpoint returns character JSON payload.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("OAUTH_CLIENT_SECRET", "test-client-secret")

import pytest

from app import app as flask_app


@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as client:
        yield client


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
