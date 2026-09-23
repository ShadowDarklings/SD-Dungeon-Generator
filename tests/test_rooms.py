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
            "generation": {"entranceRoomId": "r1"},
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
    room = create(host, players_can_import=True)
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


def test_import_allowance_is_separate_for_guests_and_host_on_same_network(clients, monkeypatch):
    from app import limiter
    host, guest, _ = clients
    room = create(host, players_can_import=True, extra_characters_without_host=True)
    join(guest, room)
    other_guest = app.test_client()
    join(other_guest, room)
    monkeypatch.setitem(app.config, "TESTING", False)
    monkeypatch.setitem(app.config, "SHADOWDARKLINGS_IMPORT_ENABLED", True)
    monkeypatch.setitem(app.config, "RATELIMIT_ENABLED", True)
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json",
                        lambda base_classes_only=False: '{"name":"Party Member"}')
    limiter.reset()
    try:
        for member, count in ((guest, 32), (other_guest, 16), (host, 16)):
            for _ in range(count):
                response = post(member, "/api/shadowdarklings/import", {"room_id": room["id"]})
                assert response.status_code == 200, response.json
        assert post(guest, "/api/shadowdarklings/import", {"room_id": room["id"]}).status_code == 429
    finally:
        limiter.reset()


def test_movement_batches_are_bounded_and_applied_atomically(clients):
    host, _, _ = clients
    room = create(host)
    moved = command(host, room, "move_batch", character_id="host-char", moves=[
        {"dx": 1, "dy": 0}, {"dx": 1, "dy": 0}, {"dx": 0, "dy": 1},
    ])

    assert moved.status_code == 200, moved.json
    character_state = moved.json["state_json"]["characters"][0]
    assert (character_state["x"], character_state["y"]) == (4, 3)
    motion = moved.json["state_json"]["multiplayerMotions"][-1]
    assert motion["actorId"] == moved.json["current_player_id"]
    assert [(frame["x"], frame["y"]) for frame in motion["frames"]] == [
        (2, 2), (3, 2), (4, 2), (4, 3)
    ]

    too_many = command(host, room, "move_batch", character_id="host-char", moves=[{"dx": 1, "dy": 0}] * 9)
    assert too_many.status_code == 400
    assert too_many.json["error"] == "invalid_request"


def test_each_member_persists_separate_exploration(clients):
    host, guest, _ = clients
    room = create(host, players_can_import=True)
    guest_view = join(guest, room)
    visibility = {
        "exploredEver": ["2,2", "3,2"],
        "visitedRoomIds": ["r1"],
        "exploredInnerWallInteriors": [],
        "closedDoorExploredSides": {},
    }
    heartbeat = post(guest, f"/api/rooms/{room['id']}/presence", {
        "revision": guest_view["revision"], "viewer_visibility": visibility})
    assert heartbeat.status_code == 200, heartbeat.json
    guest_after = guest.get(f"/api/rooms/{room['id']}").json
    host_after = host.get(f"/api/rooms/{room['id']}").json
    assert guest_after["viewer_visibility"]["exploredEver"] == ["2,2", "3,2"]
    assert host_after["viewer_visibility"]["exploredEver"] != ["2,2", "3,2"]

    invalid = post(guest, f"/api/rooms/{room['id']}/presence", {
        "revision": guest_after["revision"],
        "viewer_visibility": {**visibility, "exploredEver": ["999,999"]}})
    assert invalid.status_code == 400


def test_host_controls_player_imports_and_character_assignments(clients):
    host, guest, player = clients
    room = create(host)
    guest_view = join(guest, room)
    player_view = join(player, room)
    denied = command(guest, room, "import", character_json=character("Guest"))
    assert denied.status_code == 403
    assert denied.json["error"] == "player_import_disabled"
    current = guest.get(f"/api/rooms/{room['id']}").json
    assert post(guest, f"/api/rooms/{room['id']}/assignments", {
        "revision": current["revision"], "player_id": guest_view["current_player_id"],
        "character_id": "host-char"}, "patch").status_code == 404

    current = host.get(f"/api/rooms/{room['id']}").json
    assigned = post(host, f"/api/rooms/{room['id']}/assignments", {
        "revision": current["revision"], "player_id": guest_view["current_player_id"],
        "character_id": "host-char"}, "patch")
    assert assigned.status_code == 200, assigned.json
    assert assigned.json["ownership"]["host-char"] == guest_view["current_player_id"]
    assert assigned.json["assignments"][guest_view["current_player_id"]] == "host-char"
    assert command(guest, room, "move", character_id="host-char", dx=1, dy=0).status_code == 200

    current = host.get(f"/api/rooms/{room['id']}").json
    transferred = post(host, f"/api/rooms/{room['id']}/assignments", {
        "revision": current["revision"], "player_id": player_view["current_player_id"],
        "character_id": "host-char"}, "patch")
    assert transferred.status_code == 200, transferred.json
    assert transferred.json["owned_character_ids"] == []
    assert transferred.json["assignments"][guest_view["current_player_id"]] is None
    assert transferred.json["ownership"]["host-char"] == player_view["current_player_id"]
    assert command(guest, room, "move", character_id="host-char", dx=1, dy=0).status_code == 403
    assert command(player, room, "move", character_id="host-char", dx=1, dy=0).status_code == 200


def test_player_single_character_limit_resets_after_dismissal(clients):
    host, guest, _ = clients
    room = create(host, players_can_import=True)
    guest_view = join(guest, room)
    imported = command(guest, room, "import", character_json=character("First"))
    assert imported.status_code == 200, imported.json
    character_id = imported.json["owned_character_ids"][0]
    second = command(guest, room, "import", character_json=character("Second"))
    assert second.status_code == 403
    assert second.json["error"] == "import_limit"
    assert command(guest, room, "dismiss", character_id=character_id).status_code == 200
    replacement = command(guest, room, "import", character_json=character("Replacement"))
    assert replacement.status_code == 200, replacement.json

    replacement_id = replacement.json["owned_character_ids"][0]
    current = host.get(f"/api/rooms/{room['id']}").json
    reassigned = post(host, f"/api/rooms/{room['id']}/assignments", {
        "revision": current["revision"], "player_id": guest_view["current_player_id"],
        "character_id": "host-char"}, "patch")
    assert reassigned.status_code == 200, reassigned.json
    assert reassigned.json["ownership"]["host-char"] == guest_view["current_player_id"]
    assert reassigned.json["ownership"][replacement_id] == reassigned.json["current_player_id"]
    assert command(guest, room, "move", character_id=replacement_id, dx=1, dy=0).status_code == 403


def test_guest_shadowdarklings_generation_obeys_room_import_permission(clients, monkeypatch):
    host, guest, _ = clients
    room = create(host)
    join(guest, room)
    called = []
    monkeypatch.setattr("app.fetch_shadowdarklings_character_json", lambda base_classes_only=False: called.append(True) or '{"name":"Guest"}')
    previous = app.config.get("SHADOWDARKLINGS_IMPORT_ENABLED")
    app.config["SHADOWDARKLINGS_IMPORT_ENABLED"] = True
    try:
        malformed = post(guest, "/api/shadowdarklings/import", [])
        assert malformed.status_code == 400
        assert malformed.is_json and malformed.json["error"] == "invalid_json"
        assert called == []

        denied = post(guest, "/api/shadowdarklings/import", {"room_id": room["id"]})
        assert denied.status_code == 403
        assert denied.is_json and denied.json["error"] == "player_import_disabled"
        assert called == []

        current = host.get(f"/api/rooms/{room['id']}").json
        enabled = post(host, f"/api/rooms/{room['id']}/options", {
            "revision": current["revision"], "players_can_import": True}, "patch")
        assert enabled.status_code == 200
        imported = post(guest, "/api/shadowdarklings/import", {"room_id": room["id"]})
        assert imported.status_code == 200, imported.json
        assert imported.is_json and called == [True]
    finally:
        app.config["SHADOWDARKLINGS_IMPORT_ENABLED"] = previous


def test_host_absence_options_and_returning_membership(clients):
    host, guest, _ = clients
    room = create(host, players_can_import=True)
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
    room = create(host, players_can_import=True, extra_characters_without_host=True)
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
    room = create(host, players_can_import=True)
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
    room = create(host, players_can_import=True)
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


def test_replacement_invite_keeps_previous_code_valid_for_five_minutes(clients):
    from datetime import timedelta
    from room_models import RoomInvite
    from rooms import INVITE_LIFETIME

    host, guest, player = clients
    room = create(host)
    first_code = room["invite_code"]
    replacement = post(host, f"/api/rooms/{room['id']}/invite", {})
    assert replacement.status_code == 200, replacement.json
    assert INVITE_LIFETIME == timedelta(minutes=5)

    with Session(engine) as db:
        invites = db.exec(select(RoomInvite).where(RoomInvite.room_id == room["id"])).all()
        assert len(invites) == 2

    first_join = post(guest, "/api/rooms/join", {"code": first_code})
    replacement_join = post(player, "/api/rooms/join", {"code": replacement.json["invite_code"]})
    assert first_join.status_code == 200, first_join.json
    assert replacement_join.status_code == 200, replacement_join.json


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
