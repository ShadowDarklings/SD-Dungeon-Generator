"""
Owner: Backend Role (Megan)
Contract: ShadowDarklings import endpoint returns character JSON payload.

Solo visitors can import without an account. Shared-room requests must satisfy
membership and host permissions; all imports retain rate and capacity limits.
"""

import os
from contextlib import contextmanager

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("OAUTH_CLIENT_SECRET", "test-client-secret")

import pytest
from sqlmodel import SQLModel, Session

from app import app as flask_app, engine, User, get_db_session, limiter
from import_capacity import ImportBusyError


@pytest.fixture
def client():
    """Test client logged in as a real user (Flask-Login `_user_id` convention)."""
    flask_app.config["TESTING"] = True
    # Explicitly enable the feature context during general test runtime
    flask_app.config["SHADOWDARKLINGS_IMPORT_ENABLED"] = True

    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        user = User(username="importer", password_hash="pbkdf2:sha256:...")
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

    client = flask_app.test_client()
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True
    yield client


def test_shadowdarklings_import_allows_casual_visitors(monkeypatch):
    """Public importing does not depend on a development-only bypass."""
    monkeypatch.delenv("ALLOW_ANON_SHADOWDARKLINGS_IMPORT", raising=False)
    monkeypatch.setitem(flask_app.config, "TESTING", True)
    monkeypatch.setitem(flask_app.config, "SHADOWDARKLINGS_IMPORT_ENABLED", True)
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json",
                        lambda base_classes_only=False: '{"name":"Casual Visitor"}')
    SQLModel.metadata.create_all(engine)
    with flask_app.test_client() as anon:
        response = anon.post("/api/shadowdarklings/import", json={})
    assert response.status_code == 200
    assert response.json["character_json"] == '{"name":"Casual Visitor"}'


def test_casual_import_still_requires_csrf(monkeypatch):
    monkeypatch.setitem(flask_app.config, "WTF_CSRF_ENABLED", True)
    monkeypatch.setitem(flask_app.config, "SHADOWDARKLINGS_IMPORT_ENABLED", True)
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json",
                        lambda base_classes_only=False: '{"name":"Visitor"}')
    with flask_app.test_client() as anon:
        assert anon.post("/api/shadowdarklings/import", json={}).status_code == 400
        token = anon.get("/api/session").json["csrf_token"]
        response = anon.post("/api/shadowdarklings/import", json={}, headers={"X-CSRFToken": token})
        assert response.status_code == 200


@pytest.mark.parametrize("room_id,status", [("missing-room", 404), (123, 400), ({}, 400)])
def test_public_import_does_not_bypass_room_validation(monkeypatch, room_id, status):
    monkeypatch.setitem(flask_app.config, "SHADOWDARKLINGS_IMPORT_ENABLED", True)
    def unexpected_import(**kwargs):
        pytest.fail("Invalid room requests must not launch the importer")
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json", unexpected_import)
    SQLModel.metadata.create_all(engine)
    with flask_app.test_client() as anon:
        assert anon.post("/api/shadowdarklings/import", json={"room_id": room_id}).status_code == status


def test_shadowdarklings_import_allows_explicit_local_dev_bypass(monkeypatch):
    """AGENTS.md can opt local frontend sessions into anonymous importing."""
    flask_app.config["TESTING"] = True
    SQLModel.metadata.create_all(engine)
    monkeypatch.setenv("ALLOW_ANON_SHADOWDARKLINGS_IMPORT", "1")
    monkeypatch.setattr(
        "app.fetch_shadowdarklings_character_json",
        lambda base_classes_only=False: '{"name":"Local Dev","className":"Fighter"}'
    )

    with flask_app.test_client() as anon:
        response = anon.post("/api/shadowdarklings/import", json={})

    assert response.status_code == 200
    assert response.get_json()["character_json"] == '{"name":"Local Dev","className":"Fighter"}'


def test_shadowdarklings_import_endpoint_returns_copied_json(client, monkeypatch):
    """The import endpoint returns the copied ShadowDarklings JSON string."""

    monkeypatch.setattr(
        "app.fetch_shadowdarklings_character_json",
        lambda base_classes_only=False: '{"name":"Glazkhar","className":"Basilisk Warrior"}'
    )

    response = client.post("/api/shadowdarklings/import", json={})

    assert response.status_code == 200
    data = response.get_json()
    assert data["source"] == "shadowdarklings"
    assert data["character_json"] == '{"name":"Glazkhar","className":"Basilisk Warrior"}'
    assert data["generated_at"]


def test_shadowdarklings_import_releases_database_before_upstream_work(client, monkeypatch):
    def import_character(base_classes_only=False):
        assert not get_db_session().in_transaction()
        return '{"name":"Connection released"}'

    monkeypatch.setattr("app.fetch_shadowdarklings_character_json", import_character)
    response = client.post("/api/shadowdarklings/import", json={})
    assert response.status_code == 200


def test_shadowdarklings_import_disabled_when_feature_flag_is_off(client):
    """Contract §2: when the feature flag is off, the endpoint returns 503 feature_disabled."""
    flask_app.config["SHADOWDARKLINGS_IMPORT_ENABLED"] = False
    try:
        response = client.post("/api/shadowdarklings/import", json={})
        assert response.status_code == 503
        assert response.get_json()["error"] == "feature_disabled"
    finally:
        flask_app.config["SHADOWDARKLINGS_IMPORT_ENABLED"] = True


def test_shadowdarklings_import_busy_returns_json(client, monkeypatch):
    @contextmanager
    def busy_slot():
        raise ImportBusyError("busy")
        yield

    monkeypatch.setattr("app.import_slot", busy_slot)
    response = client.post("/api/shadowdarklings/import", json={})

    assert response.status_code == 503
    assert response.is_json
    assert response.get_json()["error"] == "shadowdarklings_import_busy"
    assert response.headers["Retry-After"] == "5"


def test_shadowdarklings_import_failure_returns_json(client, monkeypatch):
    def fail_import(base_classes_only=False):
        raise RuntimeError("timed out")

    monkeypatch.setattr("app.fetch_shadowdarklings_character_json", fail_import)
    response = client.post("/api/shadowdarklings/import", json={})

    assert response.status_code == 503
    assert response.is_json
    assert response.get_json()["error"] == "shadowdarklings_service_unavailable"


@pytest.fixture
def real_import_limits(client, monkeypatch):
    monkeypatch.setitem(flask_app.config, "TESTING", False)
    monkeypatch.setitem(flask_app.config, "RATELIMIT_ENABLED", True)
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json",
                        lambda base_classes_only=False: '{"name":"Rate Test"}')
    yield client
    limiter.reset()


def test_import_allows_two_rapid_full_parties_then_returns_accurate_retry(real_import_limits):
    for _ in range(32):
        response = real_import_limits.post("/api/shadowdarklings/import", json={})
        assert response.status_code == 200, response.json
    response = real_import_limits.post("/api/shadowdarklings/import", json={})
    assert response.status_code == 429
    retry = int(response.headers["Retry-After"])
    assert 1 <= retry <= 61
    assert f"{retry} seconds" in response.json["message"]


def test_casual_visitor_can_import_full_party_but_remains_rate_limited(real_import_limits):
    anon = flask_app.test_client()
    for _ in range(32):
        assert anon.post("/api/shadowdarklings/import", json={}).status_code == 200
    assert anon.post("/api/shadowdarklings/import", json={}).status_code == 429


@pytest.mark.parametrize("failure", [ImportBusyError, RuntimeError])
def test_failed_or_busy_imports_do_not_consume_quota(real_import_limits, monkeypatch, failure):
    def fail(base_classes_only=False):
        raise failure("try later")
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json", fail)
    for _ in range(40):
        assert real_import_limits.post("/api/shadowdarklings/import", json={}).status_code == 503
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json",
                        lambda base_classes_only=False: '{"name":"Recovered"}')
    for _ in range(16):
        assert real_import_limits.post("/api/shadowdarklings/import", json={}).status_code == 200


def test_another_account_on_same_network_can_import_after_player_limit(real_import_limits):
    for _ in range(32):
        assert real_import_limits.post("/api/shadowdarklings/import", json={}).status_code == 200
    with Session(engine) as db:
        user = User(username="second-importer", password_hash="unused")
        db.add(user)
        db.commit()
        user_id = user.id
    with flask_app.test_client() as second:
        with second.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True
        for _ in range(16):
            assert second.post("/api/shadowdarklings/import", json={}).status_code == 200
