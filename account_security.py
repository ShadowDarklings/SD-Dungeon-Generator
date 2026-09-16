"""Account recovery codes and versioned private save management."""
from datetime import timedelta
import secrets

from flask import current_app, flash, jsonify, redirect, render_template, request, session
from flask_login import current_user, fresh_login_required, login_required, login_user, logout_user
from sqlalchemy import delete, update
from sqlmodel import Session, select
from werkzeug.security import check_password_hash, generate_password_hash

from room_models import GameRoom, RoomMember, RecoveryCode, SaveCheckpoint, utcnow
from rooms import digest
from storage_limits import STORAGE_FULL, storage_available
from validation import validate_json, validate_state


def register_account_routes(app, engine, User, SavedRun, SavedCharacter, rate_limit):
    def confirmed(user):
        password = request.form.get("current_password", "")
        return (not user.password_hash and session.get("_fresh")) or (
            len(password) <= app.config["PASSWORD_MAX_LENGTH"] and bool(user.password_hash)
            and check_password_hash(user.password_hash, password))

    def valid_password(value):
        return app.config["PASSWORD_MIN_LENGTH"] <= len(value) <= app.config["PASSWORD_MAX_LENGTH"]

    @app.route("/account", methods=["GET", "POST"])
    @fresh_login_required
    @rate_limit("10 per minute")
    def account_settings():
        codes = None
        if request.method == "POST":
            with Session(engine) as db:
                db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
                user = db.get(User, current_user.id)
                if not confirmed(user):
                    flash("Enter your current password to confirm this change.")
                    return render_template("account.html", codes=None), 400
                action = request.form.get("action")
                if action == "password":
                    password = request.form.get("new_password", "")
                    if not valid_password(password):
                        flash("Use a password between 6 and 1024 characters.")
                        return render_template("account.html", codes=None), 400
                    user.password_hash = generate_password_hash(password)
                    user.session_version += 1
                    db.add(user)
                    db.commit()
                    login_user(user, fresh=True)
                    session["_remember"] = "clear"
                    flash("Password changed. Other sessions have been signed out.")
                elif action == "revoke":
                    user.session_version += 1
                    db.add(user)
                    db.commit()
                    login_user(user, fresh=True)
                    session["_remember"] = "clear"
                    flash("Other sessions have been signed out.")
                elif action == "recovery":
                    db.exec(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
                    codes = [secrets.token_hex(12).upper() for _ in range(8)]
                    for code in codes:
                        db.add(RecoveryCode(user_id=user.id, digest=digest(code, "recovery")))
                    db.commit()
                elif action == "delete" and request.form.get("confirmation") == user.username:
                    # Joined hosts retain their game copies, but not the deleted account identity.
                    joined_room_ids = select(RoomMember.room_id).where(RoomMember.user_id == user.id)
                    for room in db.exec(select(GameRoom).where(GameRoom.id.in_(joined_room_ids))).all():
                        room.saved_roster_json = [{**row, "user_id": None, "display_name": "Deleted player"} if row.get("user_id") == user.id else row for row in room.saved_roster_json]
                        db.add(room)
                        if room.saved_run_id:
                            for checkpoint in db.exec(select(SaveCheckpoint).where(SaveCheckpoint.saved_run_id == room.saved_run_id)).all():
                                checkpoint.roster_json = [{**row, "user_id": None, "display_name": "Deleted player"} if row.get("user_id") == user.id else row for row in checkpoint.roster_json]
                                db.add(checkpoint)
                    db.exec(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
                    db.delete(user)
                    db.commit()
                    logout_user()
                    session.clear()
                    flash("Account deleted.")
                    return redirect("/")
                else:
                    flash("Choose a valid action and confirm your username for deletion.")
                    return render_template("account.html", codes=None), 400
        return render_template("account.html", codes=codes)

    @app.route("/recover", methods=["GET", "POST"])
    @rate_limit("5 per minute; 20 per hour")
    def recover_account():
        if request.method == "POST":
            username = request.form.get("username", "")[:80]
            code = request.form.get("recovery_code", "").strip().upper()[:100]
            password = request.form.get("new_password", "")
            with Session(engine) as db:
                user = db.exec(select(User).where(User.username == username)).first()
                if user:
                    db.exec(update(User).where(User.id == user.id).values(session_version=User.session_version))
                    db.refresh(user)
                row = db.get(RecoveryCode, digest(code, "recovery"))
                if user and row and row.user_id == user.id and row.used_at is None and valid_password(password):
                    changed = db.exec(update(RecoveryCode).where(RecoveryCode.digest == row.digest, RecoveryCode.used_at == None).values(used_at=utcnow()))
                    if changed.rowcount == 1:
                        user.password_hash = generate_password_hash(password)
                        user.session_version += 1
                        db.add(user)
                        db.commit()
                        flash("Password reset. Sign in with your new password.")
                        return redirect("/login")
                flash("Unable to recover this account. Check your username, recovery code, and password length.")
        return render_template("recover.html")

    @app.get("/api/account/export")
    @fresh_login_required
    @rate_limit("2 per hour")
    def export_account():
        with Session(engine) as db:
            user = db.get(User, current_user.id)
            runs = db.exec(select(SavedRun).where(SavedRun.user_id == user.id)).all()
            characters = db.exec(select(SavedCharacter).where(SavedCharacter.user_id == user.id)).all()
            response = jsonify({"schema_version": 1, "account": {"username": user.username, "email": user.email},
                "saved_games": [run.model_dump(mode="json") for run in runs],
                "characters": [char.model_dump(mode="json") for char in characters]})
            response.headers["Content-Disposition"] = 'attachment; filename="shadowspawner-account.json"'
            return response

    @app.route("/api/characters/<int:character_id>", methods=["PUT", "DELETE"])
    @login_required
    @rate_limit("30 per minute")
    def modify_character(character_id):
        with Session(engine) as db:
            db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
            saved = db.get(SavedCharacter, character_id)
            if not saved or saved.user_id != current_user.id or saved.deleted_at:
                return {"error": "not_found"}, 404
            data = request.get_json(silent=True) or {}
            if type(data.get("revision")) is not int or data["revision"] != saved.revision:
                return {"error": "revision_conflict", "message": "Reload the character before changing this save."}, 409
            values = {"revision": saved.revision + 1, "updated_at": utcnow()}
            if request.method == "DELETE":
                values["deleted_at"] = utcnow()
            else:
                try:
                    values["character_json"] = validate_json(data.get("character_json"), max_bytes=128 * 1024)
                except ValueError as exc:
                    return {"error": "invalid_character", "message": str(exc)}, 400
                name = data.get("name", saved.name)
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 200:
                    return {"error": "invalid_name"}, 400
                values["name"] = name.strip()
            changed = db.exec(update(SavedCharacter).where(SavedCharacter.id == saved.id, SavedCharacter.revision == data["revision"], SavedCharacter.deleted_at == None).values(**values))
            if changed.rowcount != 1:
                return {"error": "revision_conflict"}, 409
            if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
                return STORAGE_FULL
            db.commit()
            db.refresh(saved)
            return {"id": saved.id, "revision": saved.revision, "name": saved.name}

    @app.get("/api/recovery")
    @login_required
    def deleted_saves():
        cutoff = utcnow() - timedelta(days=30)
        with Session(engine) as db:
            return {"results": [{"id": item.id, "kind": kind, "revision": item.revision,
                "name": item.name if kind == "character" else item.state_json.get("run", {}).get("name", "Dungeon")}
                for kind, model in (("run", SavedRun), ("character", SavedCharacter))
                for item in db.exec(select(model).where(model.user_id == current_user.id, model.deleted_at >= cutoff)).all()]}

    @app.post("/api/recovery/<kind>/<int:save_id>")
    @login_required
    @rate_limit("10 per minute")
    def restore_deleted_save(kind, save_id):
        model = {"run": SavedRun, "character": SavedCharacter}.get(kind)
        if not model:
            return {"error": "not_found"}, 404
        with Session(engine) as db:
            db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
            item = db.get(model, save_id)
            if not item or item.user_id != current_user.id or not item.deleted_at:
                return {"error": "not_found"}, 404
            from rooms import aware
            if aware(item.deleted_at) < utcnow() - timedelta(days=30):
                return {"error": "expired"}, 410
            if len(db.exec(select(model.id).where(model.user_id == current_user.id, model.deleted_at == None)).all()) >= (10 if kind == "run" else 50):
                return {"error": "save_limit"}, 409
            item.deleted_at = None
            item.revision += 1
            db.add(item)
            db.commit()
            return {"id": item.id, "revision": item.revision}

    @app.get("/api/runs/<int:run_id>/history")
    @login_required
    def run_history(run_id):
        with Session(engine) as db:
            run = db.get(SavedRun, run_id)
            if not run or run.user_id != current_user.id:
                return {"error": "not_found"}, 404
            return {"results": [{"id": item.id, "revision": item.revision, "created_at": item.created_at.isoformat()}
                for item in db.exec(select(SaveCheckpoint).where(SaveCheckpoint.saved_run_id == run.id).order_by(SaveCheckpoint.id.desc()).limit(10)).all()]}

    @app.post("/api/runs/<int:run_id>/history/<int:checkpoint_id>/restore")
    @login_required
    @rate_limit("10 per minute")
    def restore_checkpoint(run_id, checkpoint_id):
        data = request.get_json()
        with Session(engine) as db:
            db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
            room = db.exec(select(GameRoom).where(GameRoom.saved_run_id == run_id).with_for_update()).first()
            run = db.exec(select(SavedRun).where(SavedRun.id == run_id).with_for_update()).first()
            checkpoint = db.get(SaveCheckpoint, checkpoint_id)
            if not run or run.user_id != current_user.id or run.deleted_at or not checkpoint or checkpoint.saved_run_id != run.id:
                return {"error": "not_found"}, 404
            if type(data.get("revision")) is not int or run.revision != data["revision"]:
                return {"error": "revision_conflict"}, 409
            if room and room.closed_at is None:
                return {"error": "room_open", "message": "Close the hosted dungeon before restoring a checkpoint."}, 409
            previous = SaveCheckpoint(saved_run_id=run.id, revision=run.revision, state_json=run.state_json,
                roster_json=room.saved_roster_json if room else [], ownership_json=room.ownership_json if room else {})
            changed = db.exec(update(SavedRun).where(SavedRun.id == run.id, SavedRun.revision == data["revision"]).values(
                state_json=checkpoint.state_json, seed=checkpoint.state_json.get("seed", run.seed),
                level=checkpoint.state_json.get("level", run.level), revision=SavedRun.revision + 1, updated_at=utcnow()))
            if changed.rowcount != 1:
                return {"error": "revision_conflict"}, 409
            db.add(previous)
            if room:
                room.state_json = checkpoint.state_json
                room.ownership_json = checkpoint.ownership_json
                room.saved_roster_json = checkpoint.roster_json
                room.name = checkpoint.state_json.get("run", {}).get("name", room.name)[:80]
                room.updated_at = utcnow()
                room.revision += 1
                db.add(room)
            db.flush()
            old = db.exec(select(SaveCheckpoint.id).where(SaveCheckpoint.saved_run_id == run.id).order_by(SaveCheckpoint.id.desc()).offset(10)).all()
            if old:
                db.exec(delete(SaveCheckpoint).where(SaveCheckpoint.id.in_(old)))
            if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
                return STORAGE_FULL
            db.commit()
            return {"id": run.id, "revision": data["revision"] + 1}
