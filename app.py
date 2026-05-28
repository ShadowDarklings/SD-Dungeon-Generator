"""
Course 506 Week 5 Skeleton — Flask + Postgres + SQLModel + Bootstrap

Single-file Flask app demonstrating the architecture of a web application:
- Server (Flask) handles HTTP requests
- Database (Postgres via SQLModel) stores user state across requests
- Sessions (Flask sessions) keep users logged in across requests
- Templates render HTML to send back to the browser

The home page serves the static site you sync from your S3 bucket into
S3_content/. Login, register, logout, and about are Flask-rendered routes.

This file is meant to be readable top-to-bottom. No Blueprints, no app factory,
no advanced Flask patterns. Just enough to teach the architecture.
"""

import os
import requests
from datetime import datetime, timezone
from pathlib import Path
import requests
from flask import (
    Flask, render_template, request, redirect, url_for, session, flash, g,
    send_from_directory, abort,
)
from sqlmodel import SQLModel, Field, Session, create_engine, select
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import (
    LoginManager, UserMixin, login_user, logout_user, login_required, current_user
)
from sqlalchemy import (
    Column, JSON, DateTime, UniqueConstraint, Integer, ForeignKey, String, CheckConstraint, text
)

# ---------------------------------------------------------------------------
# Application setup
# ---------------------------------------------------------------------------

app = Flask(__name__)

# Secret key signs the session cookie so users can't tamper with it.
# In production this comes from an environment variable and is a long random string.
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-not-for-production")

# ---------------------------------------------------------------------------
# Session hardening (Week 7, CONTRACTS.md §9)
# ---------------------------------------------------------------------------
from datetime import timedelta

# Cookie flags — HttpOnly and SameSite always on; Secure only over HTTPS.
app.config["SESSION_COOKIE_HTTPONLY"]  = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"]   = os.environ.get("FLASK_ENV") != "development"

# Session lifetime: 2 hours without "remember me", 14 days with.
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)
app.config["REMEMBER_COOKIE_DURATION"]   = timedelta(days=14)
app.config["REMEMBER_COOKIE_HTTPONLY"]    = True
app.config["REMEMBER_COOKIE_SAMESITE"]   = "Lax"
app.config["REMEMBER_COOKIE_SECURE"]     = os.environ.get("FLASK_ENV") != "development"

# ---------------------------------------------------------------------------
# CSRF protection (Week 7, CONTRACTS.md §9.3)
# ---------------------------------------------------------------------------
from flask_wtf.csrf import CSRFProtect, CSRFError

csrf = CSRFProtect(app)

@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    return {"error": "csrf_invalid", "message": "CSRF validation failed."}, 400

# Exempt JSON API routes — protected by SameSite=Lax + JSON content type.
@csrf.exempt
def csrf_exempt_api():
    pass

# We exempt API routes by URL prefix using before_request + exempt decorator.
# Flask-WTF's CSRFProtect checks all POST/PUT/DELETE by default.
# We use the app-level exemption via WTF_CSRF_CHECK_DEFAULT below.
app.config["WTF_CSRF_CHECK_DEFAULT"] = False  # We'll check manually

@app.before_request
def csrf_check():
    """Skip CSRF for /api/ routes and test client; enforce for everything else."""
    if app.config.get("TESTING"):
        return  # Unit tests use Flask test client without CSRF tokens
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        if not request.path.startswith("/api/"):
            from flask_wtf.csrf import validate_csrf
            try:
                validate_csrf(request.form.get("csrf_token") or request.headers.get("X-CSRFToken"))
            except CSRFError as e:
                return {"error": "csrf_invalid", "message": "CSRF validation failed."}, 400

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith("/api/"):
        return {"error": "login_required", "message": "Authentication required."}, 401
    return redirect(url_for("login"))


# Database URL. Postgres runs in a separate container; the URL points there.
# For local testing without Docker, override with sqlite:
#   DATABASE_URL=sqlite:///dev.db python app.py
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://app:app@db:5432/app")

# SQLModel uses SQLAlchemy underneath. The engine is the connection pool.
engine = create_engine(DATABASE_URL, echo=False)

# Path to the synced S3 content. Students populate this with `aws s3 sync`.
# Override for local MVP debugging: S3_CONTENT_DIR=S3_content_mvp
_s3_content = os.environ.get("S3_CONTENT_DIR", "S3_content")
S3_CONTENT_DIR = Path(_s3_content)
if not S3_CONTENT_DIR.is_absolute():
    S3_CONTENT_DIR = Path(__file__).parent / S3_CONTENT_DIR


# ---------------------------------------------------------------------------
# Database model
# ---------------------------------------------------------------------------

class User(SQLModel, UserMixin, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=80)
    password_hash: str | None = Field(default=None, sa_column=Column(String(255), nullable=True))
    email: str | None = Field(default=None, sa_column=Column(String(254), unique=True, nullable=True))
    display_name: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OAuthIdentity(SQLModel, table=True):
    __tablename__ = "oauth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_user"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    provider: str = Field(max_length=50)
    provider_user_id: str = Field(max_length=200)
    provider_login: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# 1. SavedRun model
class SavedRun(SQLModel, table=True):
    __tablename__ = "saved_runs"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    seed: int = Field(nullable=False)
    level: int = Field(
        sa_column=Column(Integer, CheckConstraint("level BETWEEN 1 AND 10"), nullable=False)
    )
    state_json: dict = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), 
            nullable=False, 
            default=lambda: datetime.now(timezone.utc),
            onupdate=lambda: datetime.now(timezone.utc)
        )
    )

# 2. Tile model
class Tile(SQLModel, table=True):
    __tablename__ = "tiles"
    __table_args__ = (
        UniqueConstraint("saved_run_id", "x", "y", name="uq_tile_saved_run_x_y"),
    )

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(
        sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    x: int = Field(nullable=False)
    y: int = Field(nullable=False)
    type: str = Field(sa_column=Column(String(20), nullable=False))
    room_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))
    hall_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))

# 3. Room model
class Room(SQLModel, table=True):
    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("saved_run_id", "room_key", name="uq_room_saved_run_key"),
    )

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(
        sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    room_key: str = Field(sa_column=Column(String(80), nullable=False))
    x: int = Field(nullable=False)
    y: int = Field(nullable=False)
    width: int = Field(nullable=False)
    height: int = Field(nullable=False)
    discovered: bool = Field(default=False, nullable=False)
    explored: bool = Field(default=False, nullable=False)

# 4. Hall model
class Hall(SQLModel, table=True):
    __tablename__ = "halls"
    __table_args__ = (
        UniqueConstraint("saved_run_id", "hall_key", name="uq_hall_saved_run_key"),
    )

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(
        sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    hall_key: str = Field(sa_column=Column(String(80), nullable=False))
    from_room_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))
    to_room_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))

# 5. Entity model
class Entity(SQLModel, table=True):
    __tablename__ = "entities"
    __table_args__ = (
        UniqueConstraint("saved_run_id", "entity_key", name="uq_entity_saved_run_key"),
    )

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(
        sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    entity_key: str = Field(sa_column=Column(String(120), nullable=False))
    kind: str = Field(sa_column=Column(String(30), nullable=False))
    name: str | None = Field(default=None, sa_column=Column(String(200), nullable=True))
    x: int = Field(nullable=False)
    y: int = Field(nullable=False)
    defeated: bool = Field(default=False, nullable=False)
    collected: bool = Field(default=False, nullable=False)
    revealed: bool = Field(default=False, nullable=False)
    triggered: bool = Field(default=False, nullable=False)
    value: int | None = Field(default=None, nullable=True)

# 6. LootEntry model
class LootEntry(SQLModel, table=True):
    __tablename__ = "loot_entries"

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(
        sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    name: str = Field(sa_column=Column(String(200), nullable=False))
    value: int = Field(default=0, nullable=False)
    origin_tile: dict = Field(sa_column=Column(JSON, nullable=False))


# ---------------------------------------------------------------------------
# Session helper
#
# SQLModel doesn't have a Flask extension. We open a fresh DB session for each
# request and close it when the request finishes. Flask's `g` object holds
# request-scoped state.
# ---------------------------------------------------------------------------

def get_db_session():
    if "db_session" not in g:
        g.db_session = Session(engine)
    return g.db_session


@app.teardown_appcontext
def close_db_session(exception=None):
    db_session = g.pop("db_session", None)
    if db_session is not None:
        db_session.close()


@login_manager.user_loader
def load_user(user_id):
    db = get_db_session()
    return db.get(User, int(user_id))


# Make `user` available in every Flask-rendered template (login page, register
# page, about page, placeholder). Static files served from S3_content/ don't
# go through templates, so this only affects Jinja2-rendered pages.
@app.context_processor
def inject_user():
    return {"user": current_user}


# ---------------------------------------------------------------------------
# Routes — your S3 static site
#
# Your S3 site lives at /site/. Populate the S3_content/ folder by running:
#   aws s3 sync s3://<your-bucket>/ S3_content/
# from the repo root. Then click "My Site" in the navbar.
#
# The home page is Flask-rendered and acts as the entry point: it has the
# navbar (Login/Register/About/My Site) and a brief landing message.
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return render_template("home.html")


@app.route("/site/")
def site_home():
    index_path = S3_CONTENT_DIR / "index.html"
    if not index_path.exists():
        # Friendly placeholder when the student hasn't synced yet.
        return render_template("placeholder.html"), 200
    return send_from_directory(S3_CONTENT_DIR, "index.html")


@app.route("/site/<path:filename>")
def serve_s3_content(filename):
    file_path = S3_CONTENT_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        abort(404)
    return send_from_directory(S3_CONTENT_DIR, filename)


# ---------------------------------------------------------------------------
# Routes — authentication (Flask-rendered, not static)
# ---------------------------------------------------------------------------

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    # POST: create a new user.
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")

    if not username or not password:
        flash("Username and password are required.")
        return redirect(url_for("register"))

    db = get_db_session()
    existing = db.exec(select(User).where(User.username == username)).first()
    if existing is not None:
        flash("That username is already taken.")
        return redirect(url_for("register"))

    user = User(
        username=username,
        password_hash=generate_password_hash(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Log them in immediately after registration.
    login_user(user)
    session["user_id"] = user.id
    return redirect(url_for("home"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    # POST: validate credentials.
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")

    db = get_db_session()
    user = db.exec(select(User).where(User.username == username)).first()

    if user is None or not check_password_hash(user.password_hash, password):
        flash("Invalid username or password.")
        return redirect(url_for("login"))

    # Log them in with Flask-Login
    login_user(user)
    session["user_id"] = user.id
    return redirect(url_for("home"))


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    session.pop("user_id", None)
    return redirect(url_for("home"))


@app.route("/about")
def about():
    # Each team replaces this content with their own About page (see
    # the assignment instructions in README.md).
    return render_template("about.html")


# ---------------------------------------------------------------------------
# Saved Runs Relational DB Populate Helper
# ---------------------------------------------------------------------------

def populate_child_tables(db, run, state):
    """Refreshes all relational tables matching the saved run's JSON state snapshot."""
    # Delete any existing child rows for this run
    db.exec(text(f"DELETE FROM tiles WHERE saved_run_id = {run.id}"))
    db.exec(text(f"DELETE FROM rooms WHERE saved_run_id = {run.id}"))
    db.exec(text(f"DELETE FROM halls WHERE saved_run_id = {run.id}"))
    db.exec(text(f"DELETE FROM entities WHERE saved_run_id = {run.id}"))
    db.exec(text(f"DELETE FROM loot_entries WHERE saved_run_id = {run.id}"))
    db.commit()

    # Insert Tiles
    tiles_data = state.get("tiles", [])
    for t in tiles_data:
        tile = Tile(
            saved_run_id=run.id,
            x=t.get("x"),
            y=t.get("y"),
            type=t.get("type"),
            room_id=t.get("roomId"),
            hall_id=t.get("hallId")
        )
        db.add(tile)
        
    # Insert Rooms
    rooms_data = state.get("rooms", [])
    for r in rooms_data:
        room = Room(
            saved_run_id=run.id,
            room_key=r.get("id"),
            x=r.get("x"),
            y=r.get("y"),
            width=r.get("width"),
            height=r.get("height"),
            discovered=bool(r.get("discovered", False)),
            explored=bool(r.get("explored", False))
        )
        db.add(room)
        
    # Insert Halls
    halls_data = state.get("halls", [])
    for h in halls_data:
        hall = Hall(
            saved_run_id=run.id,
            hall_key=h.get("id"),
            from_room_id=h.get("fromRoomId"),
            to_room_id=h.get("toRoomId")
        )
        db.add(hall)
        
    # Insert Entities
    entities_data = state.get("entities", [])
    for e in entities_data:
        entity_kind = e.get("kind") or e.get("type")
        entity = Entity(
            saved_run_id=run.id,
            entity_key=e.get("id"),
            kind=entity_kind,
            name=e.get("name"),
            x=e.get("x"),
            y=e.get("y"),
            defeated=bool(e.get("defeated", False)),
            collected=bool(e.get("collected", False)),
            revealed=bool(e.get("revealed", False)),
            triggered=bool(e.get("triggered", False)),
            value=e.get("value")
        )
        db.add(entity)
        
    # Insert Loot Entries
    loot_data = state.get("lootLog", {}).get("entries", [])
    for l in loot_data:
        loot = LootEntry(
            saved_run_id=run.id,
            name=l.get("name"),
            value=l.get("value", 0),
            origin_tile=l.get("originTile", {"x": 0, "y": 0})
        )
        db.add(loot)
        
    db.commit()


# ---------------------------------------------------------------------------
# Routes — saved runs and API contracts
# ---------------------------------------------------------------------------

@app.route("/runs")
@login_required
def list_runs_page():
    limit = request.args.get("limit", default=20, type=int)
    if not (1 <= limit <= 50):
        limit = 20
    db = get_db_session()
    runs = db.exec(
        select(SavedRun)
        .where(SavedRun.user_id == current_user.id)
        .order_by(SavedRun.updated_at.desc())
        .limit(limit)
    ).all()
    # Renders placeholder with runs (front-end uses this)
    return render_template("placeholder.html", runs=runs)


@app.route("/api/runs", methods=["POST"])
@login_required
def create_run():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "invalid_json", "message": "Request body must be valid JSON."}, 400
        
    seed = data.get("seed")
    level = data.get("level")
    state_json = data.get("state_json")
    
    if seed is None:
        return {"error": "invalid_json", "message": "Seed is required."}, 400
    try:
        seed = int(seed)
    except (TypeError, ValueError):
        return {"error": "invalid_json", "message": "Seed must be an integer."}, 400
        
    if level is None:
        return {"error": "invalid_level", "message": "Level is required."}, 400
    try:
        level = int(level)
    except (TypeError, ValueError):
        return {"error": "invalid_level", "message": "Level must be an integer between 1 and 10."}, 400
    if not (1 <= level <= 10):
        return {"error": "invalid_level", "message": "Level must be between 1 and 10."}, 400
        
    if not isinstance(state_json, dict):
        return {"error": "invalid_state", "message": "state_json is required and must be an object."}, 400
        
    db = get_db_session()
    
    run = SavedRun(
        user_id=current_user.id,
        seed=seed,
        level=level,
        state_json=state_json
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    
    try:
        populate_child_tables(db, run, state_json)
    except Exception:
        pass
        
    return {
        "id": run.id,
        "seed": run.seed,
        "level": run.level,
        "state_json": run.state_json,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        "links": {"self": f"/api/runs/{run.id}"}
    }, 201


@app.route("/api/runs", methods=["GET"])
@login_required
def api_list_runs():
    limit = request.args.get("limit", default=20, type=int)
    if not (1 <= limit <= 50):
        limit = 20
    db = get_db_session()
    runs = db.exec(
        select(SavedRun)
        .where(SavedRun.user_id == current_user.id)
        .order_by(SavedRun.updated_at.desc())
        .limit(limit)
    ).all()
    
    results = []
    for r in runs:
        results.append({
            "id": r.id,
            "seed": r.seed,
            "level": r.level,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "links": {"self": f"/api/runs/{r.id}"}
        })
    return {"results": results, "error": None}, 200


@app.route("/api/runs/<int:run_id>", methods=["GET"])
@login_required
def get_run(run_id):
    db = get_db_session()
    run = db.exec(select(SavedRun).where(SavedRun.id == run_id)).first()
    
    # Enforce BOLA OWASP A01 rule (404 instead of 403)
    if run is None or run.user_id != current_user.id:
        return {"error": "not_found", "message": "Saved run not found."}, 404
        
    return {
        "id": run.id,
        "seed": run.seed,
        "level": run.level,
        "state_json": run.state_json,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None
    }, 200


@app.route("/api/runs/<int:run_id>", methods=["PUT"])
@login_required
def update_run(run_id):
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "invalid_json", "message": "Request body must be valid JSON."}, 400
        
    db = get_db_session()
    run = db.exec(select(SavedRun).where(SavedRun.id == run_id)).first()
    
    # Enforce BOLA OWASP A01 rule (404 instead of 403)
    if run is None or run.user_id != current_user.id:
        return {"error": "not_found", "message": "Saved run not found."}, 404
        
    state_json = data.get("state_json")
    if not isinstance(state_json, dict):
        return {"error": "invalid_state", "message": "state_json is required and must be an object."}, 400
        
    if "seed" in data:
        try:
            run.seed = int(data["seed"])
        except (TypeError, ValueError):
            return {"error": "invalid_json", "message": "Seed must be an integer."}, 400
        
    if "level" in data:
        try:
            level = int(data["level"])
        except (TypeError, ValueError):
            return {"error": "invalid_level", "message": "Level must be between 1 and 10."}, 400
        if not (1 <= level <= 10):
            return {"error": "invalid_level", "message": "Level must be between 1 and 10."}, 400
        run.level = level
        
    run.state_json = state_json
    run.updated_at = datetime.now(timezone.utc)
    
    db.add(run)
    db.commit()
    db.refresh(run)
    
    try:
        populate_child_tables(db, run, state_json)
    except Exception:
        pass
        
    return {
        "id": run.id,
        "seed": run.seed,
        "level": run.level,
        "state_json": run.state_json,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None
    }, 200


@app.route("/api/runs/<int:run_id>", methods=["DELETE"])
@login_required
def delete_run(run_id):
    db = get_db_session()
    run = db.exec(select(SavedRun).where(SavedRun.id == run_id)).first()
    
    # Enforce BOLA OWASP A01 rule (404 instead of 403)
    if run is None or run.user_id != current_user.id:
        return {"error": "not_found", "message": "Saved run not found."}, 404
        
    db.delete(run)
    db.commit()
    
    return "", 204


# ---------------------------------------------------------------------------
# First-run schema creation
# ---------------------------------------------------------------------------

# In production you'd use a migration tool (Alembic) instead.
# For Week 5, this is enough — it creates tables if they don't exist.
SQLModel.metadata.create_all(engine)

# ==========================================
# BACKEND ROLE WORKSPACE (Megan)
# FEATURE: External S3 Random Table Proxy
# ==========================================

@app.route("/api/random-tables", methods=["GET"])
def get_random_tables():
    """
    Proxies requests to the team's external S3 bucket to fetch random dungeon tables.
    Includes strict timeout handling and malformed JSON protection.
    """
    import flask
    from flask import request, jsonify

    level = request.args.get("level", default="1")
    table_type = request.args.get("type", default="monsters")
    
    S3_BUCKET_URL = f"http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/{table_type}-{level}.json"
    
    try:
        response = requests.get(S3_BUCKET_URL, timeout=3.0)
        response.raise_for_status()
        data = response.json()
        return jsonify({"results": data, "error": None, "message": "Success"}), 200
        
    except requests.exceptions.Timeout:
        return jsonify({
            "results": [],
            "error": "timeout",
            "message": "The upstream database server took too long to respond."
        }), 503
        
    except (requests.exceptions.RequestException, ValueError):
        return jsonify({
            "results": [],
            "error": "upstream_invalid",
            "message": "The upstream content provider returned an unparseable or faulty response."
        }), 503

# ---------------------------------------------------------------------------
# Test-login backdoor (Week 7, CONTRACTS.md §2 — testing only)
# ---------------------------------------------------------------------------

@app.route("/test/login/<username>")
def test_login(username):
    """Logs in a named user without GitHub OAuth. Only available when TESTING=True."""
    if not app.config.get("TESTING"):
        abort(404)
    db = get_db_session()
    user = db.exec(select(User).where(User.email == f"{username}@test")).first()
    if user is None:
        user = User(
            username=f"test_{username}",
            email=f"{username}@test",
            display_name=username,
            password_hash=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    login_user(user)
    return redirect("/")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
