import re
from sqlmodel import Session, select
from app import app, engine, User, SavedRun, SavedCharacter
from room_models import RecoveryCode, GameRoom
from test_rooms import clients, post, create, join, character, dungeon


def form(client, path, data):
    token = client.get("/api/session").json["csrf_token"]
    return client.post(path, data={"csrf_token": token, **data})


def test_save_revisions_history_and_soft_delete(clients):
    host, _, player = clients
    saved = post(host, "/api/runs", {"seed": 123, "level": 1, "state_json": dungeon()})
    assert saved.status_code == 201
    path = f"/api/runs/{saved.json['id']}"
    payload = {"revision": 1, "state_json": {**dungeon(), "run": {"name": "Updated"}}}
    updated = post(host, path, payload, "put")
    assert updated.status_code == 200 and updated.json["revision"] == 2
    assert post(host, path, payload, "put").status_code == 409
    assert post(player, path, payload, "put").status_code == 404
    history = host.get(path + "/history").json["results"]
    restored = post(host, path + f"/history/{history[0]['id']}/restore", {"revision": 2})
    assert restored.status_code == 200, restored.json
    assert host.get(path).json["revision"] == 3
    assert post(host, path, {}, "delete").status_code == 204
    assert host.get(path).status_code == 404
    assert host.get("/api/recovery").json["results"][0]["kind"] == "run"
    assert post(player, f"/api/recovery/run/{saved.json['id']}", {}).status_code == 404
    assert post(host, f"/api/recovery/run/{saved.json['id']}", {}).status_code == 200


def test_character_library_revision_and_delete(clients):
    host, _, player = clients
    saved = post(host, "/api/characters", {"name": "Hero", "character_json": character()}).json
    path = f"/api/characters/{saved['id']}"
    payload = {"revision": 1, "name": "New Hero", "character_json": character("New Hero")}
    assert post(player, path, payload, "put").status_code == 404
    assert post(host, path, payload, "put").json["revision"] == 2
    assert post(host, path, payload, "put").status_code == 409
    assert post(host, path, {"revision": 2}, "delete").status_code == 200
    assert host.get(path).status_code == 404


def test_recovery_codes_are_single_use_and_revoke_old_sessions(clients):
    host, guest, _ = clients
    result = form(host, "/account", {"action": "recovery", "current_password": "secret"})
    assert result.status_code == 200
    codes = re.findall(r"\b[A-F0-9]{24}\b", result.text)
    assert len(codes) == 8
    with Session(engine) as db:
        assert len(db.exec(select(RecoveryCode)).all()) == 8
        assert not any(code in str(db.exec(select(RecoveryCode)).all()) for code in codes)
    recovered = form(guest, "/recover", {"username": "host", "recovery_code": codes[0], "new_password": "new-secret"})
    assert recovered.status_code == 302
    assert host.get("/api/runs").status_code == 401
    again = form(guest, "/recover", {"username": "host", "recovery_code": codes[0], "new_password": "different-secret"})
    assert again.status_code == 200 and "Unable to recover" in again.text
    signed_in = form(guest, "/login", {"username": "host", "password": "new-secret"})
    assert signed_in.status_code == 302
    assert guest.get("/api/runs").status_code == 200


def test_guest_character_claim_on_login_and_account_export(clients):
    from test_rooms import command
    host, guest, _ = clients
    room = create(host, players_can_import=True)
    join(guest, room)
    imported = command(guest, room, "import", character_json=character("Guest"))
    member_id = imported.json["current_player_id"]
    own = imported.json["owned_character_ids"]
    response = form(guest, "/login?next=/site/?room=" + room["id"], {"username": "player", "password": "secret"})
    assert response.status_code == 302
    view = guest.get(f"/api/rooms/{room['id']}").json
    assert view["current_player_id"] == member_id and view["owned_character_ids"] == own
    exported = guest.get("/api/account/export")
    assert exported.status_code == 200
    assert "password_hash" not in exported.text and "recovery" not in exported.text


def test_account_deletion_cascades_private_data_and_hosted_games(clients):
    host, _, _ = clients
    room = create(host)
    post(host, "/api/characters", {"name": "Hero", "character_json": character()})
    result = form(host, "/account", {"action": "delete", "current_password": "secret", "confirmation": "host"})
    assert result.status_code == 302, result.text
    with Session(engine) as db:
        assert db.exec(select(User).where(User.username == "host")).first() is None
        assert db.get(GameRoom, room["id"]) is None
        assert not db.exec(select(SavedCharacter)).all()


def test_six_character_and_long_password_policy(clients):
    host, _, _ = clients
    assert form(host, "/account", {"action": "password", "current_password": "secret", "new_password": "short"}).status_code == 400
    password = "very-long-password-" * 40
    assert form(host, "/account", {"action": "password", "current_password": "secret", "new_password": password}).status_code == 200
