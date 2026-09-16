"""Host-owned dungeons, guest participation and authoritative game commands."""

from copy import deepcopy
from datetime import timedelta, timezone
from functools import wraps
import hashlib
import hmac
import secrets
import uuid

from flask import current_app, jsonify, request, session, g
from flask_login import current_user, login_required, user_logged_in
from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from game_runtime import game_runtime, GameRuntimeError
from room_models import GameRoom, RoomMember, RoomInvite, RoomCommand, SaveCheckpoint, utcnow
from validation import validate_json, validate_state
from storage_limits import storage_available, STORAGE_FULL

CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
HOST_LEASE = timedelta(seconds=45)
INVITE_LIFETIME = timedelta(minutes=30)
MAX_ROOMS = 5
MAX_MEMBERS = 16
MAX_SAVES = 10
MAX_CHECKPOINTS = 10
CHARACTER_COMMANDS = {
    "move", "attack", "end_turn", "search", "stealth", "get", "leave", "disarm",
    "interact", "pick_lock", "break_door", "spell", "light", "snuff", "guard",
    "drop_gear", "pickup", "collect", "persuade", "edit_character", "dismiss", "bury",
    "roll", "money", "coin_adjust", "coin_amount",
}
OPTION_KEYS = ("autonomous_exploration", "extra_characters_without_host", "bury_others")


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def digest(value, purpose):
    return hmac.new(current_app.secret_key.encode(), f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()


def guest_hash(create=False):
    key = session.get("room_guest_key") or request.cookies.get("sd_guest")
    if key and (len(key) != 43 or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for char in key)):
        key = None
    if not key and create:
        key = secrets.token_urlsafe(32)
        session["room_guest_key"] = key
        session.permanent = True
        g.room_guest_cookie = key
    return digest(key, "guest") if key else None


def find_member(db, room):
    if current_user.is_authenticated:
        member = db.exec(select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.user_id == current_user.id)).first()
        if member:
            return member
    key = guest_hash()
    if key:
        return db.exec(select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.guest_hash == key, RoomMember.user_id == None)).first()
    return None


def room_presence(db, room):
    members = db.exec(select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.status == "active")).all()
    cutoff = utcnow() - HOST_LEASE
    online = {member.id for member in members if aware(member.last_seen_at) >= cutoff}
    return members, any(member.role == "host" and member.id in online for member in members), online


def room_view(db, room, member, *, include_state=True):
    members, host_present, online = room_presence(db, room)
    ownership = room.ownership_json or {}
    view = {
        "id": room.id, "name": room.name, "revision": room.revision,
        "role": member.role, "current_player_id": member.id,
        "authenticated": bool(current_user.is_authenticated),
        "host_present": host_present, "closed": room.closed_at is not None,
        "saved_run_id": room.saved_run_id,
        "options": {key: getattr(room, key) for key in OPTION_KEYS},
        "joins_locked": room.joins_locked,
        "can_explore": room.closed_at is None and (member.role == "host" or host_present or room.autonomous_exploration),
        "players": [{"id": item.id, "display_name": item.display_name, "role": item.role, "online": item.id in online} for item in members],
        "ownership": ownership,
        "owned_character_ids": [key for key, owner in ownership.items() if owner == member.id],
        "error": None,
    }
    if include_state:
        view["state_json"] = room.state_json
    return view


def body():
    if not request.is_json:
        raise ValueError("Content-Type must be application/json.")
    return validate_json(request.get_json(silent=True))


def conflict():
    return {"error": "revision_conflict", "message": "The dungeon changed. Refresh and retry your action."}, 409


def check_revision(data, room):
    return type(data.get("revision")) is int and data["revision"] == room.revision


def lock_room(db, room_id):
    # SQLite also acquires its write lock before reading state; PostgreSQL locks the row.
    if db.bind.dialect.name == "sqlite":
        db.exec(update(GameRoom).where(GameRoom.id == room_id).values(revision=GameRoom.revision))
    return db.exec(select(GameRoom).where(GameRoom.id == room_id).with_for_update()).first()


def create_invite(db, room):
    db.exec(delete(RoomInvite).where(RoomInvite.room_id == room.id))
    now = utcnow()
    db.exec(delete(RoomInvite).where(RoomInvite.expires_at < now))
    for _ in range(32):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))
        code_digest = digest(code, "invite")
        try:
            with db.begin_nested():
                db.add(RoomInvite(code_digest=code_digest, room_id=room.id, expires_at=now + INVITE_LIFETIME))
                db.flush()
            origin = current_app.config.get("PUBLIC_BASE_URL") or request.host_url.rstrip("/")
            return {"invite_code": code, "invite_url": f"{origin}/site/?join={code}", "invite_expires_at": (now + INVITE_LIFETIME).isoformat()}
        except IntegrityError:
            continue
    raise ValueError("Unable to create an invitation. Please retry.")


def register_room_routes(app, engine, User, SavedRun, SavedCharacter, rate_limit):
    @app.after_request
    def guest_cookie(response):
        if getattr(g, "clear_guest_cookie", False):
            response.delete_cookie("sd_guest", path="/", secure=app.config["SESSION_COOKIE_SECURE"], httponly=True, samesite="Lax")
        elif getattr(g, "room_guest_cookie", None):
            response.set_cookie("sd_guest", g.room_guest_cookie, max_age=30 * 86400, path="/",
                secure=app.config["SESSION_COOKIE_SECURE"], httponly=True, samesite="Lax")
        return response

    @user_logged_in.connect_via(app)
    def attach_guest_characters(sender, user):
        key = guest_hash()
        if not key:
            return
        with Session(engine) as db:
            guests = db.exec(select(RoomMember).where(RoomMember.guest_hash == key, RoomMember.user_id == None)).all()
            for guest in guests:
                room = lock_room(db, guest.room_id)
                existing = db.exec(select(RoomMember).where(RoomMember.room_id == guest.room_id, RoomMember.user_id == user.id)).first()
                if not existing:
                    guest.user_id = user.id
                    guest.guest_hash = None
                    db.add(guest)
                elif guest.status == "active" and existing.status == "active":
                    room.ownership_json = {char: existing.id if owner == guest.id else owner for char, owner in room.ownership_json.items()}
                    room.revision += 1
                    guest.status = "left"
                    guest.guest_hash = None
                    db.add(guest)
                    db.add(room)
            db.commit()
        session.pop("room_guest_key", None)
        g.clear_guest_cookie = True

    def checked(view):
        @wraps(view)
        def handle(*args, **kwargs):
            try:
                return view(*args, **kwargs)
            except ValueError as exc:
                return {"error": "invalid_request", "message": str(exc)}, 400
            except GameRuntimeError as exc:
                return {"error": "game_unavailable", "message": str(exc)}, 503
            except IntegrityError:
                return {"error": "conflict", "message": "The room changed. Please retry."}, 409
        return handle

    def member_room(db, room_id, *, host=False):
        if request.method != "GET":
            host_id = db.exec(select(GameRoom.host_user_id).where(GameRoom.id == room_id)).first()
            account_ids = {host_id, current_user.id if current_user.is_authenticated else None} - {None}
            # Lock storage owners in a stable order before locking the room.
            for account_id in sorted(account_ids):
                db.exec(update(User).where(User.id == account_id).values(session_version=User.session_version))
        room = lock_room(db, room_id)
        member = find_member(db, room) if room else None
        if not member or member.status != "active" or (host and member.role != "host"):
            return None, None
        return room, member

    not_found = ({"error": "not_found", "message": "Dungeon not found."}, 404)

    @app.post("/api/rooms")
    @login_required
    @rate_limit("5 per minute")
    @checked
    def create_room():
        data = body()
        state = validate_state(data.get("state_json"), require_map=True)
        name = data.get("name", "Dungeon")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise ValueError("Dungeon names must contain 1 to 80 characters.")
        options = data.get("options", {})
        if not isinstance(options, dict) or any(key in options and type(options[key]) is not bool for key in OPTION_KEYS):
            raise ValueError("Room options must be yes or no.")
        with Session(engine) as db:
            db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
            rooms = db.exec(select(GameRoom).where(GameRoom.host_user_id == current_user.id, GameRoom.closed_at == None)).all()
            if len(db.exec(select(GameRoom.id).where(GameRoom.host_user_id == current_user.id)).all()) >= 50:
                return {"error": "room_limit", "message": "The retained-dungeon limit has been reached."}, 409
            now = utcnow()
            for old_room in rooms:
                if aware(old_room.updated_at) < now - timedelta(hours=24):
                    old_room.closed_at = now
                    db.add(old_room)
            if sum(room.closed_at is None for room in rooms) >= MAX_ROOMS:
                return {"error": "room_limit", "message": "Close an open dungeon before hosting another."}, 409
            normalized = game_runtime.apply(state, {"type": "normalize"})["state_json"]
            room = GameRoom(host_user_id=current_user.id, name=name.strip(), state_json=normalized, **{key: options.get(key, False) for key in OPTION_KEYS})
            db.add(room)
            db.flush()
            host = RoomMember(room_id=room.id, user_id=current_user.id, display_name=(current_user.display_name or current_user.username)[:80], role="host")
            db.add(host)
            db.flush()
            room.ownership_json = {character["id"]: host.id for character in normalized["characters"]}
            invitation = create_invite(db, room)
            db.add(room)
            if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
                return STORAGE_FULL
            db.commit()
            return {**room_view(db, room, host), **invitation}, 201

    @app.post("/api/rooms/join")
    @rate_limit("6 per minute; 30 per hour")
    @checked
    def join_room():
        data = body()
        code = str(data.get("code", "")).strip().upper()
        if len(code) != 4 or any(letter not in CODE_ALPHABET for letter in code):
            return {"error": "invalid_invite", "message": "The invitation is invalid or expired."}, 404
        with Session(engine) as db:
            invite = db.get(RoomInvite, digest(code, "invite"))
            if not invite or aware(invite.expires_at) <= utcnow():
                return {"error": "invalid_invite", "message": "The invitation is invalid or expired."}, 404
            room = lock_room(db, invite.room_id)
            if not room or room.closed_at or room.joins_locked:
                return {"error": "invalid_invite", "message": "The invitation is invalid or expired."}, 404
            member = find_member(db, room)
            if member and member.status == "kicked":
                return not_found
            if not member:
                count = len(db.exec(select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.status == "active")).all())
                if count >= MAX_MEMBERS:
                    return {"error": "room_full", "message": "This dungeon has reached its player limit."}, 409
                name = data.get("display_name")
                if not isinstance(name, str) or not name.strip():
                    name = (current_user.display_name or current_user.username) if current_user.is_authenticated else "Guest"
                member = RoomMember(room_id=room.id, user_id=current_user.id if current_user.is_authenticated else None,
                    guest_hash=None if current_user.is_authenticated else guest_hash(create=True), display_name=name.strip()[:80])
            member.status = "active"
            member.last_seen_at = utcnow()
            db.add(member)
            db.commit()
            return room_view(db, room, member)

    @app.get("/api/rooms/saved")
    @login_required
    @checked
    def saved_rooms():
        with Session(engine) as db:
            records = db.exec(select(GameRoom, RoomMember).join(RoomMember, RoomMember.room_id == GameRoom.id).join(SavedRun, SavedRun.id == GameRoom.saved_run_id).where(
                RoomMember.user_id == current_user.id, RoomMember.status == "active", SavedRun.deleted_at == None
            ).order_by(GameRoom.updated_at.desc()).limit(100)).all()
            return {"results": [{"id": room.id, "name": room.name, "role": member.role, "updated_at": room.updated_at.isoformat(), "saved_run_id": room.saved_run_id}
                for room, member in records if member.role == "host" or any(row.get("id") == member.id for row in room.saved_roster_json)]}

    @app.get("/api/rooms/<room_id>")
    @rate_limit("120 per minute")
    @checked
    def get_room(room_id):
        with Session(engine) as db:
            room, member = member_room(db, room_id)
            if not room:
                return not_found
            include_state = request.args.get("revision", type=int) != room.revision
            return room_view(db, room, member, include_state=include_state)

    @app.post("/api/rooms/<room_id>/presence")
    @rate_limit("90 per minute")
    @checked
    def room_heartbeat(room_id):
        data = body()
        with Session(engine) as db:
            room, member = member_room(db, room_id)
            if not room:
                return not_found
            now = utcnow()
            member.last_seen_at = now
            db.add(member)
            db.flush()
            _, host_present, online = room_presence(db, room)
            elapsed = (now - aware(room.simulated_at)).total_seconds()
            if elapsed >= 2:
                if not room.closed_at and (host_present or room.autonomous_exploration) and room.state_json.get("characters"):
                    result = game_runtime.apply(room.state_json, {"type": "tick", "elapsed_ms": min(15000, int(elapsed * 1000)),
                        "online_character_ids": [char for char, owner in room.ownership_json.items() if owner in online]})
                    room.state_json = validate_state(result["state_json"], require_map=True)
                    room.revision += 1
                room.simulated_at = now
                db.add(room)
            db.commit()
            return room_view(db, room, member, include_state=data.get("revision") != room.revision)

    @app.post("/api/rooms/<room_id>/commands")
    @rate_limit("120 per minute")
    @checked
    def room_command(room_id):
        data = body()
        command = data.get("command")
        if not isinstance(command, dict) or command.get("type") not in CHARACTER_COMMANDS | {"import"}:
            raise ValueError("Unknown game action.")
        request_id = data.get("request_id")
        if not isinstance(request_id, str) or not 16 <= len(request_id) <= 64:
            raise ValueError("A unique request ID is required.")
        with Session(engine) as db:
            room, member = member_room(db, room_id)
            if not room or room.closed_at:
                return not_found
            receipt = db.exec(select(RoomCommand).where(RoomCommand.room_id == room.id, RoomCommand.member_id == member.id, RoomCommand.request_id == request_id)).first()
            if receipt:
                return {**room_view(db, room, member), "message": receipt.message, "replayed": True}
            if not check_revision(data, room):
                return conflict()
            _, host_present, online = room_presence(db, room)
            action = command["type"]
            if action != "import" and member.role != "host" and not (host_present or room.autonomous_exploration):
                return {"error": "host_absent", "message": "The host is away. Character loading, saving and viewing remain available."}, 403
            ownership = dict(room.ownership_json)
            own_ids = {key for key, owner in ownership.items() if owner == member.id}
            trusted = deepcopy(command)
            trusted["online_character_ids"] = [char for char, owner in ownership.items() if owner in online or owner == member.id]
            if action == "import":
                if len(room.state_json.get("characters", [])) >= 16:
                    return {"error": "character_limit", "message": "This dungeon already contains 16 characters."}, 409
                if member.role != "host" and not host_present and own_ids and not room.extra_characters_without_host:
                    return {"error": "import_limit", "message": "The host must be present before you add another character."}, 403
                if "saved_character_id" in command:
                    if type(command["saved_character_id"]) is not int:
                        raise ValueError("Invalid saved character ID.")
                    if not current_user.is_authenticated:
                        return {"error": "login_required", "message": "Sign in to load a saved character."}, 401
                    saved = db.get(SavedCharacter, command["saved_character_id"])
                    if not saved or saved.user_id != current_user.id or saved.deleted_at:
                        return not_found
                    trusted["character_json"] = saved.character_json
                validate_json(trusted.get("character_json"), max_bytes=128 * 1024)
                trusted["new_character_id"] = uuid.uuid4().hex
                ownership[trusted["new_character_id"]] = member.id
            else:
                character_id = command.get("character_id")
                if not isinstance(character_id, str) or character_id not in ownership:
                    return not_found
                if character_id not in own_ids and not (action == "bury" and (member.role == "host" or room.bury_others)):
                    return {"error": "character_not_owned", "message": "You can control only your own characters."}, 403
                if action == "edit_character":
                    validate_json(command.get("character_json"), max_bytes=128 * 1024)
                if action in {"bury", "dismiss"}:
                    ownership.pop(character_id, None)
            result = game_runtime.apply(room.state_json, trusted)
            room.state_json = validate_state(result["state_json"], require_map=True)
            room.ownership_json = ownership
            room.revision += 1
            room.updated_at = utcnow()
            member.last_seen_at = utcnow()
            message = result.get("message", "")[:2000]
            db.add(room)
            db.add(member)
            db.add(RoomCommand(room_id=room.id, member_id=member.id, request_id=request_id, revision=room.revision, message=message))
            db.exec(delete(RoomCommand).where(RoomCommand.room_id == room.id, RoomCommand.created_at < utcnow() - timedelta(days=1)))
            if not storage_available(db, room.host_user_id, SavedRun, SavedCharacter):
                return STORAGE_FULL
            db.commit()
            return {**room_view(db, room, member), "message": message, "dice": result.get("dice")}

    @app.post("/api/rooms/<room_id>/invite")
    @rate_limit("6 per minute")
    @checked
    def rotate_invite(room_id):
        body()
        with Session(engine) as db:
            room, member = member_room(db, room_id, host=True)
            if not room or room.closed_at:
                return not_found
            invite = create_invite(db, room)
            db.commit()
            return invite

    @app.patch("/api/rooms/<room_id>/options")
    @rate_limit("20 per minute")
    @checked
    def room_options(room_id):
        data = body()
        with Session(engine) as db:
            room, member = member_room(db, room_id, host=True)
            if not room:
                return not_found
            if not check_revision(data, room):
                return conflict()
            for key in (*OPTION_KEYS, "joins_locked"):
                if key in data:
                    if type(data[key]) is not bool:
                        raise ValueError("Room options must be yes or no.")
                    setattr(room, key, data[key])
            room.revision += 1
            db.add(room)
            db.commit()
            return room_view(db, room, member)

    @app.post("/api/rooms/<room_id>/leave")
    @checked
    def leave_room(room_id):
        body()
        with Session(engine) as db:
            room, member = member_room(db, room_id)
            if not room:
                return not_found
            member.last_seen_at = utcnow() - HOST_LEASE * 2
            db.add(member)
            db.commit()
            return {"ok": True}

    @app.post("/api/rooms/<room_id>/close")
    @checked
    def close_room(room_id):
        data = body()
        with Session(engine) as db:
            room, member = member_room(db, room_id, host=True)
            if not room:
                return not_found
            if not check_revision(data, room):
                return conflict()
            room.closed_at = utcnow()
            room.revision += 1
            db.exec(delete(RoomInvite).where(RoomInvite.room_id == room.id))
            db.add(room)
            db.commit()
            return room_view(db, room, member)

    @app.post("/api/rooms/<room_id>/resume")
    @checked
    def resume_room(room_id):
        body()
        with Session(engine) as db:
            room, member = member_room(db, room_id)
            if not room:
                return not_found
            if room.closed_at and member.role != "host":
                return {"error": "room_closed", "message": "The host has closed this dungeon."}, 403
            if room.closed_at and len(db.exec(select(GameRoom.id).where(GameRoom.host_user_id == room.host_user_id, GameRoom.closed_at == None)).all()) >= MAX_ROOMS:
                return {"error": "room_limit", "message": "Close an open dungeon before reopening this one."}, 409
            if room.saved_run_id:
                saved = db.get(SavedRun, room.saved_run_id)
                if not saved or saved.deleted_at:
                    return not_found
            room.closed_at = None
            member.last_seen_at = utcnow()
            db.add(room)
            db.add(member)
            db.commit()
            return room_view(db, room, member)

    @app.post("/api/rooms/<room_id>/players/<player_id>/kick")
    @checked
    def kick_room_player(room_id, player_id):
        body()
        with Session(engine) as db:
            room, host = member_room(db, room_id, host=True)
            target = db.get(RoomMember, player_id)
            if not room or not target or target.room_id != room.id or target.role == "host":
                return not_found
            target.status = "kicked"
            room.revision += 1
            db.add(target)
            db.add(room)
            invite = create_invite(db, room)
            db.commit()
            return {**room_view(db, room, host), **invite}

    @app.post("/api/rooms/<room_id>/save")
    @login_required
    @checked
    def save_room(room_id):
        data = body()
        name = data.get("name")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise ValueError("Choose a dungeon save name of 1 to 80 characters.")
        with Session(engine) as db:
            room, host = member_room(db, room_id, host=True)
            if not room:
                return not_found
            if not check_revision(data, room):
                return conflict()
            run = db.get(SavedRun, room.saved_run_id) if room.saved_run_id else None
            if run and run.deleted_at:
                return not_found
            snapshot = deepcopy(room.state_json)
            snapshot["schema_version"] = 1
            snapshot["run"] = {**snapshot.get("run", {}), "name": name.strip()}
            if run is None:
                db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
                if len(db.exec(select(SavedRun.id).where(SavedRun.user_id == current_user.id, SavedRun.deleted_at == None)).all()) >= MAX_SAVES:
                    raise ValueError("Your saved-game limit has been reached.")
                run = SavedRun(user_id=current_user.id, seed=int(snapshot["seed"]), level=int(snapshot["level"]), state_json=snapshot)
                db.add(run)
                db.flush()
                room.saved_run_id = run.id
            else:
                run.revision += 1
            snapshot["run"].update(id=run.id, revision=run.revision)
            members = db.exec(select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.status == "active")).all()
            roster = [{"id": item.id, "user_id": item.user_id, "display_name": item.display_name, "role": item.role} for item in members]
            run.state_json = snapshot
            run.updated_at = utcnow()
            room.name = name.strip()
            room.state_json = {**room.state_json, "run": {**room.state_json.get("run", {}), "name": name.strip(), "id": run.id, "revision": run.revision}}
            room.revision += 1
            room.saved_roster_json = roster
            room.updated_at = utcnow()
            db.add(SaveCheckpoint(saved_run_id=run.id, revision=run.revision, state_json=snapshot, roster_json=roster, ownership_json=room.ownership_json))
            db.add(run)
            db.add(room)
            db.flush()
            old = db.exec(select(SaveCheckpoint.id).where(SaveCheckpoint.saved_run_id == run.id).order_by(SaveCheckpoint.id.desc()).offset(MAX_CHECKPOINTS)).all()
            if old:
                db.exec(delete(SaveCheckpoint).where(SaveCheckpoint.id.in_(old)))
            if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
                return STORAGE_FULL
            db.commit()
            return {**room_view(db, room, host), "message": f"Saved {room.name}."}

    @app.post("/api/rooms/<room_id>/characters/<character_id>/save")
    @login_required
    @checked
    def save_room_character(room_id, character_id):
        data = body()
        with Session(engine) as db:
            room, member = member_room(db, room_id)
            if not room or room.ownership_json.get(character_id) != member.id:
                return not_found
            character = next((item for item in room.state_json.get("characters", []) if item["id"] == character_id), None)
            if not character:
                return not_found
            db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
            if len(db.exec(select(SavedCharacter.id).where(SavedCharacter.user_id == current_user.id, SavedCharacter.deleted_at == None)).all()) >= 50:
                raise ValueError("Your saved-character limit has been reached.")
            saved = SavedCharacter(user_id=current_user.id, name=str(data.get("name") or character.get("name") or "Character")[:200], character_json=deepcopy(character))
            db.add(saved)
            if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
                return STORAGE_FULL
            db.commit()
            return {"id": saved.id, "name": saved.name}, 201
