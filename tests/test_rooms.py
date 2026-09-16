import os
import uuid
from copy import deepcopy

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from sqlmodel import SQLModel, Session, select
from werkzeug.security import generate_password_hash
from app import app, engine, User, SavedCharacter
from room_models import GameRoom, RoomMember, SaveCheckpoint


def character(name="Host", identifier="host-char"):
    return {"id": identifier, "name": name, "className": "Fighter", "class": "Fighter",
            "level": 1, "hp": 8, "maxHitPoints": 8, "armorClass": 12,
            "stats": {key: 10 for key in ("STR", "DEX", "CON", "INT", "WIS", "CHA")},
            "gear": [], "attacks": ["Sword: +2, 1d6, close"], "x": 2, "y": 2, "roomId": "r1"}


def dungeon():
    return {"seed": 123, "level": 1, "map": {"width": 7, "height": 7},
            "tiles": [{"x": x, "y": y, "type": "floor", "roomId": "r1"} for y in range(7) for x in range(7)],
            "rooms": [{"id": "r1", "x": 0, "y": 0, "width": 7, "height": 7}],
            "entities": [{"id": "stairs", "type": "stairs", "subtype": "up", "x": 2, "y": 2, "roomId": "r1"}],
            "characters": [character()], "activeCharacterId": "host-char",
            "player": {"x": 2, "y": 2, "roomId": "r1", "torchLit": False}, "run": {}}


@pytest.fixture
def clients():
    app.config.update(TESTING=True, WTF_CSRF_ENABLED=True)
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        host = User(username="host", password_hash=generate_password_hash("secret"))
        player = User(username="player", password_hash=generate_password_hash("secret"))
        db.add(host)
        db.add(player)
        db.commit()
        ids = host.get_id(), player.get_id()
    host, guest, player = app.test_client(), app.test_client(), app.test_client()
    for client, username in ((host, "host"), (player, "player")):
        token = client.get("/api/session").json["csrf_token"]
        response = client.post("/login", data={"username": username, "password": "secret", "csrf_token": token})
        assert response.status_code == 302
    yield host, guest, player
    app.config["WTF_CSRF_ENABLED"] = False


def post(client, path, data, method="post"):
    token = client.get("/api/session").json["csrf_token"]
    return getattr(client, method)(path, json=data, headers={"X-CSRFToken": token})


def create(host, **options):
    result = post(host, "/api/rooms", {"state_json": dungeon(), "options": options})
    assert result.status_code == 201, result.json
    return result.json


def join(client, room):
    result = post(client, "/api/rooms/join", {"code": room["invite_code"]})
    assert result.status_code == 200, result.json
    return result.json


def command(client, room, action, **args):
    current = client.get(f"/api/rooms/{room['id']}").json
    return post(client, f"/api/rooms/{room['id']}/commands", {
        "revision": current["revision"], "request_id": uuid.uuid4().hex,
        "command": {"type": action, **args}})


def test_guest_owns_import_and_cannot_invite_or_control_host(clients):
    host, guest, _ = clients
    room = create(host)
    assert len(room["invite_code"]) == 4 and room["invite_code"].isalnum()
    member = join(guest, room)
    assert member["owned_character_ids"] == []
    assert "invite_code" not in member and "invite_url" not in member
    assert post(guest, f"/api/rooms/{room['id']}/invite", {}).status_code == 404
    assert command(guest, room, "move", character_id="host-char", dx=1, dy=0).status_code == 403
    imported = command(guest, room, "import", character_json=character("Guest"))
    assert imported.status_code == 200, imported.json
    owned = imported.json["owned_character_ids"][0]
    moved = command(guest, room, "move", character_id=owned, dx=1, dy=0)
    assert moved.status_code == 200, moved.json
    host_view = host.get(f"/api/rooms/{room['id']}").json
    assert host_view["state_json"] == moved.json["state_json"]
    assert command(host, room, "move", character_id=owned, dx=1, dy=0).status_code == 403
    assert post(guest, f"/api/rooms/{room['id']}/characters/{owned}/save", {}).status_code == 401


def test_host_absence_options_and_returning_membership(clients):
    host, guest, _ = clients
    room = create(host)
    join(guest, room)
    imported = command(guest, room, "import", character_json=character("Guest")).json
    owned = imported["owned_character_ids"][0]
    post(host, f"/api/rooms/{room['id']}/leave", {})
    assert command(guest, room, "move", character_id=owned, dx=1, dy=0).status_code == 403
    assert command(guest, room, "edit_character", character_id=owned, character_json=character()).status_code == 403
    assert command(guest, room, "import", character_json=character()).status_code == 403
    current = host.get(f"/api/rooms/{room['id']}").json
    updated = post(host, f"/api/rooms/{room['id']}/options", {
        "revision": current["revision"], "autonomous_exploration": True,
        "extra_characters_without_host": True}, "patch")
    assert updated.status_code == 200
    assert command(guest, room, "move", character_id=owned, dx=1, dy=0).status_code == 200
    assert command(guest, room, "import", character_json=character()).status_code == 200
    post(host, f"/api/rooms/{room['id']}/invite", {})
    assert post(guest, f"/api/rooms/{room['id']}/resume", {}).status_code == 200


def test_burial_and_sixteen_character_cap(clients):
    host, guest, _ = clients
    room = create(host)
    join(guest, room)
    with Session(engine) as db:
        saved = db.get(GameRoom, room["id"])
        state = deepcopy(saved.state_json)
        state["characters"][0].update(dead=True, slain=True, hp=0, dyingRounds=0)
        saved.state_json = state
        db.add(saved)
        db.commit()
    assert command(guest, room, "bury", character_id="host-char").status_code == 403
    assert command(host, room, "bury", character_id="host-char").status_code == 200
    for _ in range(16):
        result = command(guest, room, "import", character_json=character())
        assert result.status_code == 200, result.json
    assert command(guest, room, "import", character_json=character()).status_code == 409


def test_revision_idempotency_csrf_and_private_saved_characters(clients):
    host, guest, player = clients
    room = create(host)
    join(guest, room)
    join(player, room)
    payload = {"revision": room["revision"], "request_id": uuid.uuid4().hex,
               "command": {"type": "move", "character_id": "host-char", "dx": 1, "dy": 0}}
    path = f"/api/rooms/{room['id']}/commands"
    assert host.post(path, json=payload).status_code == 400
    first = post(host, path, payload)
    assert first.status_code == 200, first.json
    again = post(host, path, payload)
    assert again.json["revision"] == first.json["revision"]
    payload["request_id"] = uuid.uuid4().hex
    assert post(host, path, payload).status_code == 409
    private = post(host, f"/api/rooms/{room['id']}/characters/host-char/save", {"name": "Hero"})
    assert private.status_code == 201
    assert command(player, room, "import", saved_character_id=private.json["id"]).status_code == 404
    assert command(player, room, "import", saved_character_id={}).status_code == 400


def test_named_host_save_preserves_roster_and_personal_characters(clients):
    host, _, player = clients
    room = create(host)
    join(player, room)
    imported = command(player, room, "import", character_json=character("Player")).json
    owned = imported["owned_character_ids"][0]
    current = host.get(f"/api/rooms/{room['id']}").json
    saved = post(host, f"/api/rooms/{room['id']}/save", {"name": "Old Crypt", "revision": current["revision"]})
    assert saved.status_code == 200, saved.json
    results = player.get("/api/rooms/saved").json["results"]
    assert results[0]["name"] == "Old Crypt"
    assert post(player, f"/api/rooms/{room['id']}/save", {"name": "Stolen", "revision": current["revision"]}).status_code == 404
    assert post(player, f"/api/rooms/{room['id']}/characters/{owned}/save", {"name": "My Hero"}).status_code == 201
    with Session(engine) as db:
        checkpoint = db.exec(select(SaveCheckpoint)).first()
        assert len(checkpoint.roster_json) == 2
        assert checkpoint.ownership_json[owned] == imported["current_player_id"]


def test_malformed_state_and_origin_are_rejected(clients):
    host, _, _ = clients
    assert post(host, "/api/rooms", []).status_code == 400
    state = dungeon()
    state["map"]["width"] = 999999
    assert post(host, "/api/rooms", {"state_json": state}).status_code == 400
    token = host.get("/api/session").json["csrf_token"]
    result = host.post("/api/rooms", json={"state_json": dungeon()}, headers={"X-CSRFToken": token, "Origin": "https://attacker.invalid"})
    assert result.status_code == 403


def test_invite_expiration_lock_and_kick_do_not_grant_reentry(clients):
    from datetime import timedelta
    from room_models import RoomInvite, utcnow
    host, guest, player = clients
    room = create(host)
    assert player.get(f"/api/rooms/{room['id']}").status_code == 404
    with Session(engine) as db:
        invite = db.exec(select(RoomInvite).where(RoomInvite.room_id == room["id"])).one()
        invite.expires_at = utcnow() - timedelta(seconds=1)
        db.add(invite)
        db.commit()
    assert post(guest, "/api/rooms/join", {"code": room["invite_code"]}).status_code == 404
    room.update(post(host, f"/api/rooms/{room['id']}/invite", {}).json)
    member = join(guest, room)
    current = host.get(f"/api/rooms/{room['id']}").json
    assert post(host, f"/api/rooms/{room['id']}/options", {"revision": current["revision"], "joins_locked": True}, "patch").status_code == 200
    assert post(player, "/api/rooms/join", {"code": room["invite_code"]}).status_code == 404
    assert post(guest, f"/api/rooms/{room['id']}/resume", {}).status_code == 200
    current = host.get(f"/api/rooms/{room['id']}").json
    assert post(host, f"/api/rooms/{room['id']}/players/{member['current_player_id']}/kick", {"revision": current["revision"]}).status_code == 200
    assert guest.get(f"/api/rooms/{room['id']}").status_code == 404
    assert post(guest, f"/api/rooms/{room['id']}/resume", {}).status_code == 404


def test_guest_cookie_survives_session_cookie_expiry(clients):
    host, guest, _ = clients
    room = create(host)
    member = join(guest, room)
    cookie = guest.get_cookie("sd_guest")
    assert cookie.http_only and cookie.same_site == "Lax"
    guest.delete_cookie(app.config["SESSION_COOKIE_NAME"])
    resumed = post(guest, f"/api/rooms/{room['id']}/resume", {})
    assert resumed.status_code == 200
    assert resumed.json["current_player_id"] == member["current_player_id"]


def test_deleted_host_save_is_hidden_from_joined_load_list(clients):
    host, _, player = clients
    room = create(host)
    join(player, room)
    current = host.get(f"/api/rooms/{room['id']}").json
    saved = post(host, f"/api/rooms/{room['id']}/save", {"revision": current["revision"], "name": "Old Crypt"}).json
    assert player.get("/api/rooms/saved").json["results"]
    run_id = saved["saved_run_id"]
    assert post(host, f"/api/runs/{run_id}", {}, "delete").status_code == 204
    assert player.get("/api/rooms/saved").json["results"] == []


def test_account_storage_limit_rolls_back_room_creation(clients, monkeypatch):
    import storage_limits
    host, _, _ = clients
    monkeypatch.setattr(storage_limits, "MAX_ACCOUNT_BYTES", 1)
    response = post(host, "/api/rooms", {"state_json": dungeon()})
    assert response.status_code == 409 and response.json["error"] == "storage_limit"
    with Session(engine) as db:
        assert db.exec(select(GameRoom)).all() == []
