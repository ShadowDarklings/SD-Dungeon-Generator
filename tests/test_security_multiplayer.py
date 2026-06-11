"""
Security Tests: Multiplayer Host Links (CONTRACTS.md §16.9 merge-gate checklist)
Owner: Mario, Database and Security Role

Covers every §16.9 item:
1. Unauthenticated create/join/get/assign → 401 JSON envelope
2. Unknown invite code → 404 not_found (same body as not-joined — no existence leak)
3. Non-member GET → 404; joined player GET → 200
4. Duplicate join is idempotent
5. Non-host assignment → 404; host assignment → 200 and visible in next GET
6. invalid_assignment for foreign player_id or unknown character_id
7. Invite codes are high-entropy and non-sequential
8. Session payload contains no email/oauth/password fields
9. Wrong content type / invalid JSON → 400 invalid_json
Plus §16.6 caps: session_full and too_many_sessions.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("OAUTH_CLIENT_SECRET", "test-client-secret")

import json

import pytest
from sqlmodel import SQLModel, Session, select

from app import (
    app,
    engine,
    User,
    MultiplayerSession,
    MultiplayerPlayer,
    MAX_PLAYERS_PER_SESSION,
    MAX_OPEN_SESSIONS_PER_HOST,
)

STATE = {
    "characters": [{"id": "char-1", "name": "Glaz"}, {"id": "char-2", "name": "Mira"}],
    "tiles": [],
}


@pytest.fixture
def env():
    """Fresh schema + three users; returns (client_factory, user_ids)."""
    app.config["TESTING"] = True

    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    ids = {}
    with Session(engine) as db:
        for name in ("alice", "bob", "eve"):
            user = User(
                username=name,
                password_hash="pbkdf2:sha256:...",
                email=f"{name}@example.com",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            ids[name] = user.id

    def client_for(name=None):
        client = app.test_client()
        if name is not None:
            with client.session_transaction() as sess:
                sess["_user_id"] = str(ids[name])
                sess["_fresh"] = True
        return client

    return client_for, ids


def create_session(client, state=STATE, seed=42, level=3):
    return client.post(
        "/api/multiplayer/sessions",
        json={"seed": seed, "level": level, "host_character_id": None, "state_json": state},
    )


# ── 1. Authentication ──────────────────────────────────────────────────────

def test_unauthenticated_requests_get_401(env):
    client_for, _ = env
    anon = client_for(None)

    responses_ = [
        anon.post("/api/multiplayer/sessions", json={}),
        anon.post("/api/multiplayer/sessions/somecode/join", json={}),
        anon.get("/api/multiplayer/sessions/somecode"),
        anon.post("/api/multiplayer/sessions/somecode/assignments", json={}),
    ]
    for response in responses_:
        assert response.status_code == 401
        assert response.get_json()["error"] == "login_required"


# ── 2 & 3. Invite-code privacy / membership gating ─────────────────────────

def test_unknown_code_and_non_member_get_identical_404(env):
    client_for, _ = env
    alice = client_for("alice")
    eve = client_for("eve")

    code = create_session(alice).get_json()["invite_code"]

    unknown = eve.get("/api/multiplayer/sessions/definitely-not-a-code")
    non_member = eve.get(f"/api/multiplayer/sessions/{code}")

    assert unknown.status_code == non_member.status_code == 404
    # Identical envelope — a non-member cannot distinguish "exists" from "doesn't".
    assert unknown.get_json() == non_member.get_json()


def test_joined_player_can_fetch_session(env):
    client_for, _ = env
    alice = client_for("alice")
    bob = client_for("bob")

    code = create_session(alice).get_json()["invite_code"]
    join = bob.post(f"/api/multiplayer/sessions/{code}/join", json={"display_name": "Bob"})
    assert join.status_code == 200
    assert join.get_json()["role"] == "player"

    fetch = bob.get(f"/api/multiplayer/sessions/{code}")
    assert fetch.status_code == 200
    assert {p["display_name"] for p in fetch.get_json()["players"]} >= {"Bob"}


# ── 4. Idempotent join ──────────────────────────────────────────────────────

def test_duplicate_join_is_idempotent(env):
    client_for, _ = env
    alice = client_for("alice")
    bob = client_for("bob")

    code = create_session(alice).get_json()["invite_code"]
    first = bob.post(f"/api/multiplayer/sessions/{code}/join", json={})
    second = bob.post(f"/api/multiplayer/sessions/{code}/join", json={})

    assert first.status_code == second.status_code == 200
    assert len(second.get_json()["players"]) == 2  # host + bob, no duplicate row


# ── 5 & 6. Assignment authorization and validation ──────────────────────────

def test_assignment_rules(env):
    client_for, _ = env
    alice = client_for("alice")
    bob = client_for("bob")
    eve = client_for("eve")

    created = create_session(alice).get_json()
    code = created["invite_code"]
    bob_join = bob.post(f"/api/multiplayer/sessions/{code}/join", json={})
    bob_player_id = next(
        p["id"] for p in bob_join.get_json()["players"] if p["role"] == "player"
    )

    # Non-member assign → 404
    r = eve.post(f"/api/multiplayer/sessions/{code}/assignments",
                 json={"player_id": bob_player_id, "character_id": "char-1"})
    assert r.status_code == 404

    # Non-host member assign → 404 (not 403 — no role leakage)
    r = bob.post(f"/api/multiplayer/sessions/{code}/assignments",
                 json={"player_id": bob_player_id, "character_id": "char-1"})
    assert r.status_code == 404

    # Host assign with unknown character → 400 invalid_assignment
    r = alice.post(f"/api/multiplayer/sessions/{code}/assignments",
                   json={"player_id": bob_player_id, "character_id": "char-999"})
    assert r.status_code == 400
    assert r.get_json()["error"] == "invalid_assignment"

    # Host assign with foreign/bogus player id → 400 invalid_assignment
    r = alice.post(f"/api/multiplayer/sessions/{code}/assignments",
                   json={"player_id": 99999, "character_id": "char-1"})
    assert r.status_code == 400
    assert r.get_json()["error"] == "invalid_assignment"

    # Host assign, valid → 200, and visible in a subsequent GET
    r = alice.post(f"/api/multiplayer/sessions/{code}/assignments",
                   json={"player_id": bob_player_id, "character_id": "char-1"})
    assert r.status_code == 200
    assert r.get_json()["ok"] is True

    fetch = bob.get(f"/api/multiplayer/sessions/{code}").get_json()
    assert {"player_id": bob_player_id, "character_id": "char-1"} in fetch["assignments"]


def test_reassignment_moves_character_to_one_holder(env):
    client_for, _ = env
    alice = client_for("alice")
    bob = client_for("bob")

    created = create_session(alice).get_json()
    code = created["invite_code"]
    host_player_id = created["players"][0]["id"]
    bob_join = bob.post(f"/api/multiplayer/sessions/{code}/join", json={})
    bob_player_id = next(
        p["id"] for p in bob_join.get_json()["players"] if p["role"] == "player"
    )

    alice.post(f"/api/multiplayer/sessions/{code}/assignments",
               json={"player_id": host_player_id, "character_id": "char-1"})
    r = alice.post(f"/api/multiplayer/sessions/{code}/assignments",
                   json={"player_id": bob_player_id, "character_id": "char-1"})

    holders = [a["player_id"] for a in r.get_json()["assignments"]
               if a["character_id"] == "char-1"]
    assert holders == [bob_player_id]


# ── 7. Invite-code quality ──────────────────────────────────────────────────

def test_invite_codes_are_high_entropy_and_non_sequential(env):
    client_for, _ = env
    alice = client_for("alice")

    codes = [create_session(alice).get_json()["invite_code"] for _ in range(2)]

    assert codes[0] != codes[1]
    for code in codes:
        assert len(code) >= 20            # token_urlsafe(16) → 22 chars
        assert not code.isdigit()         # not a row id / counter
    # URL-safe alphabet only
    import re
    assert all(re.fullmatch(r"[A-Za-z0-9_-]+", c) for c in codes)


# ── 8. Payload privacy ──────────────────────────────────────────────────────

def test_session_payload_excludes_sensitive_fields(env):
    client_for, _ = env
    alice = client_for("alice")
    bob = client_for("bob")

    code = create_session(alice).get_json()["invite_code"]
    bob.post(f"/api/multiplayer/sessions/{code}/join", json={})
    payload = json.dumps(alice.get(f"/api/multiplayer/sessions/{code}").get_json())

    for forbidden in ("email", "password_hash", "provider_user_id", "@example.com"):
        assert forbidden not in payload, f"sensitive field leaked: {forbidden}"


# ── 9. Content-type / JSON handling ─────────────────────────────────────────

def test_invalid_json_and_wrong_content_type_are_400(env):
    client_for, _ = env
    alice = client_for("alice")

    r = alice.post("/api/multiplayer/sessions", data="not json at all",
                   content_type="text/plain")
    assert r.status_code == 400
    assert r.get_json()["error"] == "invalid_json"

    code = create_session(alice).get_json()["invite_code"]
    r = alice.post(f"/api/multiplayer/sessions/{code}/assignments",
                   data="{broken", content_type="application/json")
    assert r.status_code == 400
    assert r.get_json()["error"] == "invalid_json"


# ── §16.6 caps ──────────────────────────────────────────────────────────────

def test_session_player_cap(env):
    client_for, ids = env
    alice = client_for("alice")
    code = create_session(alice).get_json()["invite_code"]

    # Fill the session up to the cap (host occupies one slot).
    with Session(engine) as db:
        extra_needed = MAX_PLAYERS_PER_SESSION - 1
        for i in range(extra_needed):
            user = User(username=f"filler{i}", password_hash="x")
            db.add(user)
            db.commit()
            db.refresh(user)
            mp = db.exec(
                select(MultiplayerSession).where(
                    MultiplayerSession.invite_code == code
                )
            ).first()
            db.add(MultiplayerPlayer(
                session_id=mp.id, user_id=user.id,
                display_name=f"Filler {i}", role="player",
            ))
            db.commit()

    bob = client_for("bob")
    r = bob.post(f"/api/multiplayer/sessions/{code}/join", json={})
    assert r.status_code == 409
    assert r.get_json()["error"] == "session_full"


def test_open_sessions_per_host_cap(env):
    client_for, _ = env
    alice = client_for("alice")

    for _ in range(MAX_OPEN_SESSIONS_PER_HOST):
        assert create_session(alice).status_code == 201

    r = create_session(alice)
    assert r.status_code == 409
    assert r.get_json()["error"] == "too_many_sessions"
