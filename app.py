from __future__ import annotations

"""
Course 506 Week 7 — Flask + Postgres/SQLite + SQLModel + Bootstrap + OAuth Engine

Fully synchronized with CONTRACTS.md specifications.
"""

import os
import json
import re
import random
import secrets
import time
from urllib.parse import urlsplit
from datetime import datetime, timezone, timedelta
from pathlib import Path
from flask import (
    Flask, render_template, request, redirect, url_for, session, flash, g,
    send_from_directory, abort, jsonify,
)
from sqlmodel import SQLModel, Field, Session, create_engine, select, delete
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.exceptions import RequestEntityTooLarge
from flask_login import (
    LoginManager, UserMixin, login_user, logout_user, login_required, current_user, user_logged_in
)
from sqlalchemy import (
    Column, JSON, DateTime, UniqueConstraint, Integer, ForeignKey, String, CheckConstraint, text, inspect, update
)
from dotenv import load_dotenv
from authlib.integrations.flask_client import OAuth
from flask_wtf.csrf import CSRFProtect, CSRFError, generate_csrf
from room_models import GameRoom, RoomMember, RoomInvite, RoomCommand, SaveCheckpoint
from validation import validate_json, validate_state
from storage_limits import storage_available, STORAGE_FULL
from import_capacity import ImportBusyError, import_slot
from shadowdarklings_import import fetch_shadowdarklings_character_json

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# ---------------------------------------------------------------------------
# 1. Environment Secrets Management (§12)
# ---------------------------------------------------------------------------

load_dotenv()

SECRET_KEY = os.environ["SECRET_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]
OAUTH_CLIENT_ID = os.environ["OAUTH_CLIENT_ID"]
OAUTH_CLIENT_SECRET = os.environ["OAUTH_CLIENT_SECRET"]

# ---------------------------------------------------------------------------
# 2. Application Setup & Security Hardening Configuration (§9)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 2. Application Setup & Security Hardening Configuration (§9)
# ---------------------------------------------------------------------------

app = Flask(__name__)

# MEGAN'S HARDENING: Apply ProxyFix middleware.
# This forces Flask to trust the security headers (X-Forwarded-*) injected by Nginx.
# Without this, Flask won't realize the incoming traffic is over HTTPS, which breaks
# our url_for redirects and stops secure cookies from attaching!
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=0, x_prefix=0)

app.config["SECRET_KEY"] = SECRET_KEY
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)
app.config["REMEMBER_COOKIE_DURATION"] = timedelta(days=14)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["REMEMBER_COOKIE_HTTPONLY"] = True
app.config["REMEMBER_COOKIE_SAMESITE"] = "Lax"
app.config["PUBLIC_BASE_URL"] = os.environ.get("PUBLIC_BASE_URL", "https://ctreeder.com" if os.environ.get("FLASK_ENV") == "production" else "").rstrip("/")
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_CONTENT_LENGTH_BYTES", 5 * 1024 * 1024))
app.config["SHADOWDARKLINGS_IMPORT_ENABLED"] = (
    os.environ.get("SHADOWDARKLINGS_IMPORT_ENABLED") == "1"
    or os.environ.get("FLASK_ENV") != "production"
)

# MEGAN'S HARDENING: Secure cookies now activate in production over true HTTPS!
if os.environ.get("FLASK_ENV") == "production":
    app.config["SESSION_COOKIE_SECURE"] = True
else:
    app.config["SESSION_COOKIE_SECURE"] = False
app.config["REMEMBER_COOKIE_SECURE"] = app.config["SESSION_COOKIE_SECURE"]

if os.environ.get("FLASK_ENV") == "production":
    if len(SECRET_KEY) < 32 or SECRET_KEY in {"change-me", "dev-secret-not-for-production"}:
        raise RuntimeError("Production requires a random SECRET_KEY of at least 32 characters.")
    if os.environ.get("ALLOW_ANON_SHADOWDARKLINGS_IMPORT") == "1":
        raise RuntimeError("The development import bypass must not be enabled in production.")
    if os.environ.get("RATELIMIT_STORAGE_URI", "memory://").startswith("memory"):
        raise RuntimeError("Production requires a shared rate-limit storage URI.")

csrf = CSRFProtect(app)

PASSWORD_MIN_LENGTH = int(os.environ.get("PASSWORD_MIN_LENGTH", 6))
PASSWORD_MAX_LENGTH = int(os.environ.get("PASSWORD_MAX_LENGTH", 1024))
app.config["PASSWORD_MIN_LENGTH"] = PASSWORD_MIN_LENGTH
app.config["PASSWORD_MAX_LENGTH"] = PASSWORD_MAX_LENGTH

SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
        "img-src 'self' data:; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
}


@app.after_request
def add_security_headers(response):
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    if app.config["SESSION_COOKIE_SECURE"] or request.is_secure:
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    if request.path.startswith("/api/") or request.path in {"/login", "/register", "/recover", "/runs", "/account"}:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    return jsonify({"error": "csrf_invalid", "message": "CSRF validation failed."}), 400


@app.errorhandler(RequestEntityTooLarge)
def handle_request_entity_too_large(e):
    return jsonify({"error": "payload_too_large", "message": "Request body is too large."}), 413


rate_storage_uri = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
limiter = Limiter(get_remote_address, app=app, storage_uri=rate_storage_uri,
    storage_options={"socket_connect_timeout": 2, "socket_timeout": 2} if rate_storage_uri.startswith(("redis://", "rediss://")) else {},
    default_limits=[])


def _skip_rate_limits():
    return bool(app.config.get("TESTING"))


def rate_limit(limit_value, *, ip_limit=None, key_func=None, **kwargs):
    def account_key():
        if current_user.is_authenticated:
            return f"user:{current_user.id}"
        if request.path == "/login" and request.method == "POST":
            from rooms import digest
            return "login:" + digest(request.form.get("username", "").strip(), "rate")
        return "ip:" + get_remote_address()
    def decorator(view):
        view = limiter.limit(limit_value, exempt_when=_skip_rate_limits, key_func=key_func or account_key, **kwargs)(view)
        return limiter.limit(ip_limit or limit_value, exempt_when=_skip_rate_limits, key_func=get_remote_address, **kwargs)(view)
    return decorator


def import_player_key():
    if current_user.is_authenticated:
        return f"user:{current_user.id}"
    from rooms import guest_hash
    guest = guest_hash()
    return f"guest:{guest}" if guest else "ip:" + get_remote_address()


@app.errorhandler(429)
def rate_limit_error(error):
    limit = limiter.current_limit
    retry_after = max(1, limit.reset_at - int(time.time())) if limit else 60
    response = jsonify(error="rate_limited", message=f"Too many requests. Please wait {retry_after} seconds before retrying.")
    response.status_code = 429
    response.headers["Retry-After"] = str(retry_after)
    return response


@app.before_request
def validate_request_boundary():
    if request.path.startswith("/api/multiplayer/sessions"):
        return {"error": "retired_api", "message": "Reload the game to use the current dungeon rooms."}, 410
    public_url = app.config.get("PUBLIC_BASE_URL")
    if public_url and request.host != urlsplit(public_url).netloc:
        if request.path != "/healthz":
            return {"error": "invalid_host", "message": "Invalid host."}, 400
    origin = request.headers.get("Origin")
    expected_origin = public_url or request.host_url.rstrip("/")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin and origin != expected_origin:
        return {"error": "invalid_origin", "message": "Cross-origin requests are not allowed."}, 403
    if request.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH"}:
        try:
            if not request.is_json:
                raise ValueError("Content-Type must be application/json.")
            validate_json(request.get_json(silent=True))
        except (ValueError, RecursionError, OverflowError) as exc:
            return {"error": "invalid_json", "message": str(exc)}, 400


@app.get("/api/session")
def api_session():
    return {"csrf_token": generate_csrf(), "authenticated": bool(current_user.is_authenticated),
        "username": current_user.username if current_user.is_authenticated else None}


# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith("/api/"):
        return {"error": "login_required", "message": "Authentication required."}, 401
    return redirect(url_for("login"))


@login_manager.needs_refresh_handler
def refresh_login():
    if request.path.startswith("/api/"):
        return {"error": "reauthentication_required", "message": "Sign in again before accessing account security settings."}, 401
    session["login_destination"] = "/account"
    return redirect(url_for("login"))


# Initialize Engines
engine = create_engine(DATABASE_URL, echo=False, hide_parameters=True)
if engine.dialect.name == "sqlite":
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def sqlite_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")
S3_CONTENT_DIR = Path(__file__).parent / "S3_content"
SHADOWDARKLINGS_CREATE_URL = "https://shadowdarklings.net/create"

oauth = OAuth(app)
oauth.register(
    name="github",
    client_id=OAUTH_CLIENT_ID,
    client_secret=OAUTH_CLIENT_SECRET,
    access_token_url="https://github.com/login/oauth/access_token",
    access_token_params=None,
    authorize_url="https://github.com/login/oauth/authorize",
    authorize_params=None,
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "user:email"},
)


def bootstrap_database() -> None:
    """Create tables and apply tiny compatibility migrations for old EC2 volumes."""
    SQLModel.metadata.create_all(engine)
    migrate_existing_database()


def migrate_existing_database() -> None:
    """Backfill columns added after the first EC2 Postgres deployment.

    SQLModel's create_all creates missing tables but does not alter existing
    tables. The EC2 pgdata volume may survive branch upgrades, so keep these
    migrations idempotent and narrow.
    """
    additions = {"users": {"session_version": "INTEGER NOT NULL DEFAULT 0"},
        "saved_runs": {"revision": "INTEGER NOT NULL DEFAULT 1", "deleted_at": "TIMESTAMP"},
        "saved_characters": {"revision": "INTEGER NOT NULL DEFAULT 1", "deleted_at": "TIMESTAMP"},
        "game_rooms": {
            # Existing rooms keep their prior import behavior. Newly created rooms
            # explicitly send the model default (False).
            "players_can_import": "BOOLEAN NOT NULL DEFAULT TRUE",
            "primary_assignments_json": "JSON NOT NULL DEFAULT '{}'",
        },
        "room_members": {
            "visibility_json": "JSON NOT NULL DEFAULT '{}'",
        }}
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table_name, columns in additions.items():
            if not inspector.has_table(table_name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in columns.items():
                if column_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))
    if not DATABASE_URL.startswith("postgresql"):
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(200)"))
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE")
        )
        conn.execute(text("UPDATE users SET created_at = NOW() WHERE created_at IS NULL"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))


# ---------------------------------------------------------------------------
# Database model
# ---------------------------------------------------------------------------

class User(SQLModel, UserMixin, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=80)
    password_hash: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, unique=True, index=True, max_length=254)
    display_name: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    session_version: int = Field(default=0, nullable=False)

    def get_id(self):
        return f"{self.id}:{self.session_version}"

class OAuthIdentity(SQLModel, table=True):
    __tablename__ = "oauth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_provider_user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    provider: str = Field(max_length=50, nullable=False)
    provider_user_id: str = Field(max_length=200, nullable=False, index=True)
    provider_login: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SavedRun(SQLModel, table=True):
    __tablename__ = "saved_runs"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    seed: int = Field(nullable=False)
    level: int = Field(sa_column=Column(Integer, CheckConstraint("level BETWEEN 1 AND 10"), nullable=False))
    state_json: dict = Field(sa_column=Column(JSON, nullable=False))
    revision: int = Field(default=1, nullable=False)
    deleted_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)))
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)))

class SavedCharacter(SQLModel, table=True):
    __tablename__ = "saved_characters"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(sa_column=Column(String(200), nullable=False))
    character_json: dict = Field(sa_column=Column(JSON, nullable=False))
    revision: int = Field(default=1, nullable=False)
    deleted_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)))
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)))

class Tile(SQLModel, table=True):
    __tablename__ = "tiles"
    __table_args__ = (UniqueConstraint("saved_run_id", "x", "y", name="uq_tile_saved_run_x_y"),)

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True))
    x: int = Field(nullable=False)
    y: int = Field(nullable=False)
    type: str = Field(sa_column=Column(String(20), nullable=False))
    room_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))
    hall_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))

class Room(SQLModel, table=True):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("saved_run_id", "room_key", name="uq_room_saved_run_key"),)

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True))
    room_key: str = Field(sa_column=Column(String(80), nullable=False))
    x: int = Field(nullable=False)
    y: int = Field(nullable=False)
    width: int = Field(nullable=False)
    height: int = Field(nullable=False)
    discovered: bool = Field(default=False, nullable=False)
    explored: bool = Field(default=False, nullable=False)

class Hall(SQLModel, table=True):
    __tablename__ = "halls"
    __table_args__ = (UniqueConstraint("saved_run_id", "hall_key", name="uq_hall_saved_run_key"),)

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True))
    hall_key: str = Field(sa_column=Column(String(80), nullable=False))
    from_room_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))
    to_room_id: str | None = Field(default=None, sa_column=Column(String(80), nullable=True))

class Entity(SQLModel, table=True):
    __tablename__ = "entities"
    __table_args__ = (UniqueConstraint("saved_run_id", "entity_key", name="uq_entity_saved_run_key"),)

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True))
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

class LootEntry(SQLModel, table=True):
    __tablename__ = "loot_entries"

    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(sa_column=Column(String(200), nullable=False))
    value: int = Field(default=0, nullable=False)
    origin_tile: dict = Field(sa_column=Column(JSON, nullable=False))


class MultiplayerSession(SQLModel, table=True):
    """CONTRACTS.md §16.1 — a hosted invite-link game session."""
    __tablename__ = "multiplayer_sessions"

    id: int | None = Field(default=None, primary_key=True)
    host_user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    invite_code: str = Field(sa_column=Column(String(43), nullable=False, unique=True, index=True))
    seed: int = Field(nullable=False)
    level: int = Field(sa_column=Column(Integer, CheckConstraint("level BETWEEN 1 AND 10"), nullable=False))
    state_json: dict = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)))
    updated_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)))
    closed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class MultiplayerPlayer(SQLModel, table=True):
    """CONTRACTS.md §16.1 — membership row; `id` is the player_id in API payloads."""
    __tablename__ = "multiplayer_players"
    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_mp_session_user"),)

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(sa_column=Column(Integer, ForeignKey("multiplayer_sessions.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    display_name: str = Field(sa_column=Column(String(200), nullable=False))
    role: str = Field(sa_column=Column(String(10), nullable=False))
    assigned_character_id: str | None = Field(default=None, sa_column=Column(String(120), nullable=True))
    joined_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)))
    last_seen_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)))


# Create tables AFTER every model class is defined. Calling this earlier
# (the pre-fix position was between OAuthIdentity and SavedRun) meant a fresh
# database only got `users` and `oauth_identities` - the first save would 500.
if os.environ.get("SD_SKIP_DB_BOOTSTRAP") != "1":
    if os.environ.get("FLASK_ENV") != "production" or os.environ.get("AUTO_MIGRATE") == "1":
        bootstrap_database()
    if os.environ.get("FLASK_ENV") == "production":
        import shutil
        if not shutil.which(os.environ.get("GAME_NODE_EXECUTABLE", "node")):
            raise RuntimeError("Production requires the Node.js game runtime.")
        if engine.dialect.name != "postgresql":
            raise RuntimeError("Production requires PostgreSQL.")
        with engine.connect() as connection:
            role = connection.execute(text("SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user")).first()
            if not role or any(role):
                raise RuntimeError("The web application's database role must be unprivileged.")


# ---------------------------------------------------------------------------
# Session helper
# ---------------------------------------------------------------------------


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
    try:
        identity, _, version = str(user_id).partition(":")
        user = db.get(User, int(identity))
        return user if user and user.session_version == int(version or 0) else None
    except (ValueError, TypeError):
        return None


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

def remember_login_destination():
    destination = request.args.get("next")
    if destination and destination.startswith("/site/") and not destination.startswith("//") and "\\" not in destination:
        session["login_destination"] = destination[:300]


def login_destination():
    destination = session.pop("login_destination", "")
    return destination if (destination.startswith("/site/") or destination in {"/account", "/runs"}) and "\\" not in destination else url_for("site_home")


@app.route("/register", methods=["GET", "POST"])
@rate_limit("5 per minute", methods=["POST"])
@rate_limit("20 per hour", methods=["POST"])
def register():
    if request.method == "GET":
        remember_login_destination()
        return render_template("register.html")

    # POST: create a new user.
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")

    if not username or not password:
        flash("Username and password are required.")
        return redirect(url_for("register"))

    if len(username) > 80:
        flash("Username must be at most 80 characters.")
        return redirect(url_for("register"))

    if len(password) < PASSWORD_MIN_LENGTH:
        flash(f"Password must be at least {PASSWORD_MIN_LENGTH} characters.")
        return redirect(url_for("register"))

    if len(password) > PASSWORD_MAX_LENGTH:
        flash("Password is too long.")
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

    session.permanent = True
    login_user(user)
    return redirect(login_destination())


@app.route("/login", methods=["GET", "POST"])
@rate_limit("10 per minute", methods=["POST"])
@rate_limit("50 per hour", methods=["POST"])
def login():
    if request.method == "GET":
        remember_login_destination()
        return render_template("login.html")

    # POST: validate credentials.
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if len(username) > 80 or len(password) > PASSWORD_MAX_LENGTH:
        flash("Invalid username or password.")
        return redirect(url_for("login"))

    db = get_db_session()
    user = db.exec(select(User).where(User.username == username)).first()

    if user is not None and user.password_hash is None:
        flash("This account uses GitHub login.")
        return redirect(url_for("login"))

    if user is None or not check_password_hash(user.password_hash, password):
        flash("Invalid username or password.")
        return redirect(url_for("login"))

    session.permanent = True
    # §9.2: "remember me" sets the 14-day remember_token cookie; without it the
    # session expires after PERMANENT_SESSION_LIFETIME (2h).
    remember = request.form.get("remember") == "1"
    login_user(user, remember=remember)
    return redirect(login_destination())


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    g.clear_guest_cookie = True
    logout_user()
    session.pop("room_guest_key", None)
    return redirect(url_for("home"))


@app.route("/login/github")
@rate_limit("20 per minute")
def login_github():
    redirect_uri = url_for("auth_github_callback", _external=True)
    return oauth.github.authorize_redirect(redirect_uri)


@app.route("/auth/github/callback")
def auth_github_callback():
    try:
        token = oauth.github.authorize_access_token()
    except Exception:
        flash("Authentication token exchange failed.", "error")
        return redirect(url_for("login"))

    resp = oauth.github.get("user", token=token)
    if not resp.ok:
        flash("Failed to retrieve user profile information from GitHub.", "error")
        return redirect(url_for("login"))

    profile = resp.json()
    github_id = str(profile.get("id") or "")
    github_login = profile.get("login")
    github_email = profile.get("email")
    github_name = profile.get("name") or github_login

    if not github_id or not github_login:
        flash("Incomplete profile data provided by authentication partner.", "error")
        return redirect(url_for("login"))

    db = get_db_session()
    identity_stmt = select(OAuthIdentity).where(
        OAuthIdentity.provider == "github",
        OAuthIdentity.provider_user_id == github_id,
    )
    identity = db.exec(identity_stmt).first()

    if identity:
        user = db.get(User, identity.user_id)
        if not user:
            flash("Linked account profile no longer exists.", "error")
            return redirect(url_for("login"))
        identity.provider_login = github_login
        db.add(identity)
        db.commit()
        session.permanent = True
        login_user(user)
        return redirect(url_for("list_runs_page"))

    user = None
    if github_email:
        email_stmt = select(User).where(User.email == github_email)
        user = db.exec(email_stmt).first()

    if user:
        flash("An account with this email already exists. Sign in to that account first.")
        return redirect(url_for("login"))

    unique_username = f"github_{github_login}"
    collision_stmt = select(User).where(User.username == unique_username)
    if db.exec(collision_stmt).first():
        unique_username = f"github_{github_login}_{github_id[:6]}"

    new_user = User(
        username=unique_username,
        password_hash=None,
        email=github_email,
        display_name=github_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    db.add(OAuthIdentity(
        user_id=new_user.id,
        provider="github",
        provider_user_id=github_id,
        provider_login=github_login,
    ))
    db.commit()

    session.permanent = True
    login_user(new_user)
    return redirect(url_for("list_runs_page"))


@app.route("/test/login/<username>")
def test_login(username):
    if not app.config.get("TESTING"):
        abort(404)

    db = get_db_session()
    user = db.exec(select(User).where(User.username == username)).first()
    if user is None:
        user = User(
            username=username,
            password_hash=None,
            email=f"{username}@test.local",
            display_name=username,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    session.permanent = True
    login_user(user)
    return redirect(url_for("list_runs_page"))


@app.route("/about")
def about():
    # Each team replaces this content with their own About page (see
    # the assignment instructions in README.md).
    return render_template("about.html")


@app.route("/healthz")
def healthz():
    """Lightweight liveness/readiness check for nginx and Docker Compose."""
    try:
        if os.environ.get("FLASK_ENV") == "production" and not limiter.storage.check():
            return {"status": "degraded", "rate_limits": "unavailable"}, 503
        with Session(engine) as db:
            db.exec(text("SELECT 1"))
            db.exec(select(GameRoom.id).limit(1)).first()
            db.exec(select(User.session_version).limit(1)).first()
            if os.environ.get("FLASK_ENV") == "production" and engine.dialect.name == "postgresql":
                role = db.exec(text("SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user")).first()
                if any(role):
                    return {"status": "degraded", "database": "overprivileged_role"}, 503
        return {"status": "ok", "database": "ok"}, 200
    except Exception as exc:
        app.logger.warning("Health check failed: %s", exc)
        return {"status": "degraded", "database": "unavailable"}, 503


@app.route("/api/shadowdarklings/import", methods=["POST"])
@rate_limit("32 per minute; 256 per hour", ip_limit="256 per minute; 2048 per hour",
            key_func=import_player_key, deduct_when=lambda response: response.status_code == 200)
def import_shadowdarklings_character():
    # Solo visitors can import without an account. Shared-room imports still
    # enforce membership and host permissions before launching browser work.
    # Production-capable feature (CONTRACTS.md section 2): keep it explicit
    # because it runs browser automation against an upstream site.
    if not app.config.get("SHADOWDARKLINGS_IMPORT_ENABLED", False):
        return {
            "error": "feature_disabled",
            "message": "Character import is not available in this environment.",
        }, 503
    from rooms import find_member
    request_data = request.get_json(silent=True)
    if not isinstance(request_data, dict):
        request_data = {}
    room_id = request_data.get("room_id")
    if room_id is not None and not isinstance(room_id, str):
        return {"error": "invalid_request", "message": "Invalid dungeon ID."}, 400
    db = get_db_session()
    room = db.get(GameRoom, room_id) if isinstance(room_id, str) else None
    member = find_member(db, room) if room else None
    room_guest = bool(member and member.status == "active" and room.closed_at is None)
    if isinstance(room_id, str):
        if not room_guest:
            return {"error": "not_found", "message": "Dungeon not found."}, 404
        if member.role != "host":
            if not room.players_can_import:
                return {"error": "player_import_disabled", "message": "The host is assigning characters for this dungeon."}, 403
            owned = {character_id for character_id, owner_id in (room.ownership_json or {}).items() if owner_id == member.id}
            if owned and not room.extra_characters_without_host:
                return {"error": "import_limit", "message": "You already control a character in this dungeon."}, 403
    # Authorization is complete; do not hold a database connection during browser I/O.
    db.close()
    import_started_at = time.monotonic()
    try:
        data = request_data
        base_classes_only = bool(data.get("base_classes_only", False))
        with import_slot():
            character_json = fetch_shadowdarklings_character_json(base_classes_only=base_classes_only)
        validate_json(json.loads(character_json), max_bytes=128 * 1024)
    except ImportBusyError:
        return {
            "error": "shadowdarklings_import_busy",
            "message": "Another character import is already running. Please try again in a moment."
        }, 503, {"Retry-After": "5"}
    except Exception as exc:
        app.logger.warning(
            "ShadowDarklings import failed after %.2fs (%s): %s",
            time.monotonic() - import_started_at,
            type(exc).__name__,
            exc,
        )
        # Hardened production failover to 503 Service Unavailable per contract architecture
        return {
            "error": "shadowdarklings_service_unavailable",
            "message": "The upstream Shadowdarklings API is currently unreachable or timed out. Please try again later."
        }, 503

    app.logger.info("ShadowDarklings import completed in %.2fs", time.monotonic() - import_started_at)
    return {
        "source": "shadowdarklings",
        "character_json": character_json,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }, 200



# ---------------------------------------------------------------------------
# Saved Runs Relational DB Populate Helper
# ---------------------------------------------------------------------------

def infer_entity_kind(entity: dict) -> str:
    """Return a non-null kind for the secondary relational snapshot."""
    kind = entity.get("kind")
    if isinstance(kind, str) and kind.strip():
        return kind.strip()

    entity_id = str(entity.get("id") or "")
    if entity_id.startswith("door"):
        return "door"
    if entity_id.startswith("trap"):
        return "trap"
    if entity_id.startswith("treasure"):
        return "treasure"
    if entity_id.startswith("monster"):
        return "monster"
    return "feature"


def populate_child_tables(db, run, state):
    """Refreshes all relational tables matching the saved run's JSON state snapshot."""
    # Delete any existing child rows for this run. ORM delete statements keep
    # all SQL parametrized — no string interpolation at the persistence
    # boundary (CONTRACTS.md extensibility / "no raw SQL" rule).
    for model in (Tile, Room, Hall, Entity, LootEntry):
        db.exec(delete(model).where(model.saved_run_id == run.id))
    db.commit()

    tiles_data = state.get("tiles", [])
    for t in tiles_data:
        tile = Tile(saved_run_id=run.id, x=t.get("x"), y=t.get("y"), type=t.get("type"), room_id=t.get("roomId"), hall_id=t.get("hallId"))
        db.add(tile)
        
    rooms_data = state.get("rooms", [])
    for r in rooms_data:
        room = Room(saved_run_id=run.id, room_key=r.get("id"), x=r.get("x"), y=r.get("y"), width=r.get("width"), height=r.get("height"), discovered=bool(r.get("discovered", False)), explored=bool(r.get("explored", False)))
        db.add(room)
        
    halls_data = state.get("halls", [])
    for h in halls_data:
        hall = Hall(saved_run_id=run.id, hall_key=h.get("id"), from_room_id=h.get("fromRoomId"), to_room_id=h.get("toRoomId"))
        db.add(hall)
        
    entities_data = state.get("entities", [])
    for e in entities_data:
        entity = Entity(saved_run_id=run.id, entity_key=e.get("id"), kind=infer_entity_kind(e), name=e.get("name"), x=e.get("x"), y=e.get("y"), defeated=bool(e.get("defeated", False)), collected=bool(e.get("collected", False)), revealed=bool(e.get("revealed", False)), triggered=bool(e.get("triggered", False)), value=e.get("value"))
        db.add(entity)
        
    loot_data = state.get("lootLog", {}).get("entries", [])
    for l in loot_data:
        loot = LootEntry(saved_run_id=run.id, name=l.get("name"), value=l.get("value", 0), origin_tile=l.get("originTile", {"x": 0, "y": 0}))
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
        .where(SavedRun.user_id == current_user.id, SavedRun.deleted_at == None)
        .order_by(SavedRun.updated_at.desc())
        .limit(limit)
    ).all()
    return render_template("runs.html", runs=runs)


@app.route("/api/runs", methods=["POST"])
@login_required
@rate_limit("60 per minute")
def create_run():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "invalid_json", "message": "Request body must be valid JSON."}, 400
        
    seed = data.get("seed")
    level = data.get("level")
    state_json = data.get("state_json")
    
    if seed is None or not isinstance(seed, int):
        return {"error": "invalid_json", "message": "Seed is required and must be an integer."}, 400
    if level is None or not isinstance(level, int) or not (1 <= level <= 10):
        return {"error": "invalid_level", "message": "Level is required and must be between 1 and 10."}, 400
        
    if not isinstance(state_json, dict):
        return {"error": "invalid_state", "message": "state_json is required and must be an object."}, 400
        
    try:
        validate_state(state_json)
    except ValueError as exc:
        return {"error": "invalid_state", "message": str(exc)}, 400
    db = get_db_session()
    db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
    if len(db.exec(select(SavedRun.id).where(SavedRun.user_id == current_user.id, SavedRun.deleted_at == None)).all()) >= 10:
        return {"error": "save_limit", "message": "You can keep up to 10 saved games. Replace or delete an existing save."}, 409
    state_json["schema_version"] = 1
    run = SavedRun(user_id=current_user.id, seed=seed, level=level, state_json=state_json)
    db.add(run)
    if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
        db.rollback()
        return STORAGE_FULL
    db.commit()
    db.refresh(run)
    
    try:
        populate_child_tables(db, run, state_json)
    except Exception:
        # The JSON state in saved_runs is the source of truth for load (§1);
        # a failed snapshot must not fail the save — but it must be visible.
        app.logger.exception("Child-table snapshot failed for run %s", run.id)
        db.rollback()

    return {
        "id": run.id,
        "revision": run.revision,
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
        .where(SavedRun.user_id == current_user.id, SavedRun.deleted_at == None)
        .order_by(SavedRun.updated_at.desc())
        .limit(limit)
    ).all()
    
    results = []
    for r in runs:
        results.append({
            "id": r.id,
            "revision": r.revision,
            "name": r.state_json.get("run", {}).get("name") or f"Level {r.level} - Seed {r.seed}",
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
    
    # Enforce BOLA OWASP A01 Rule: 404 instead of 403 (§4)
    if run is None or run.user_id != current_user.id or run.deleted_at:
        return {"error": "not_found", "message": "Saved run not found."}, 404
        
    return {
        "id": run.id,
        "revision": run.revision,
        "seed": run.seed,
        "level": run.level,
        "state_json": run.state_json,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None
    }, 200


@app.route("/api/runs/<int:run_id>", methods=["PUT"])
@login_required
@rate_limit("60 per minute")
def update_run(run_id):
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "invalid_json", "message": "Request body must be valid JSON."}, 400
        
    db = get_db_session()
    db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
    run = db.exec(select(SavedRun).where(SavedRun.id == run_id)).first()
    
    # Enforce BOLA OWASP A01 Rule: 404 instead of 403 (§4)
    if run is None or run.user_id != current_user.id or run.deleted_at:
        return {"error": "not_found", "message": "Saved run not found."}, 404
    if db.exec(select(GameRoom.id).where(GameRoom.saved_run_id == run.id)).first():
        return {"error": "room_save", "message": "Open this hosted dungeon before saving it."}, 409
    if type(data.get("revision")) is not int or data["revision"] != run.revision:
        return {"error": "revision_conflict", "message": "This save changed in another window. Reload it before overwriting."}, 409
        
    state_json = data.get("state_json")
    if not isinstance(state_json, dict):
        return {"error": "invalid_state", "message": "state_json is required and must be an object."}, 400
        
    if "seed" in data:
        seed = data["seed"]
        if not isinstance(seed, int):
            return {"error": "invalid_json", "message": "Seed must be an integer."}, 400
        run.seed = seed
        
    if "level" in data:
        level = data["level"]
        if not isinstance(level, int) or not (1 <= level <= 10):
            return {"error": "invalid_level", "message": "Level must be between 1 and 10."}, 400
        run.level = level
        
    try:
        validate_state(state_json)
    except ValueError as exc:
        return {"error": "invalid_state", "message": str(exc)}, 400
    snapshot = SaveCheckpoint(saved_run_id=run.id, revision=run.revision, state_json=run.state_json)
    state_json["schema_version"] = 1
    changed = db.exec(update(SavedRun).where(SavedRun.id == run.id, SavedRun.revision == data["revision"], SavedRun.deleted_at == None).values(
        state_json=state_json, seed=run.seed, level=run.level, revision=SavedRun.revision + 1, updated_at=datetime.now(timezone.utc)))
    if changed.rowcount != 1:
        db.rollback()
        return {"error": "revision_conflict", "message": "This save changed. Reload before overwriting."}, 409
    db.add(snapshot)
    db.flush()
    old = db.exec(select(SaveCheckpoint.id).where(SaveCheckpoint.saved_run_id == run.id).order_by(SaveCheckpoint.id.desc()).offset(10)).all()
    if old:
        db.exec(delete(SaveCheckpoint).where(SaveCheckpoint.id.in_(old)))
    if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
        db.rollback()
        return STORAGE_FULL
    db.commit()
    db.refresh(run)
    
    try:
        populate_child_tables(db, run, state_json)
    except Exception:
        # See create_run: snapshot failure is logged, never silently dropped.
        app.logger.exception("Child-table snapshot failed for run %s", run.id)
        db.rollback()

    return {
        "id": run.id,
        "revision": run.revision,
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
    db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
    run = db.exec(select(SavedRun).where(SavedRun.id == run_id)).first()
    
    # Enforce BOLA OWASP A01 rule (404 instead of 403)
    if run is None or run.user_id != current_user.id or run.deleted_at:
        return {"error": "not_found", "message": "Saved run not found."}, 404
        
    run.deleted_at = datetime.now(timezone.utc)
    run.revision += 1
    db.add(run)
    for room in db.exec(select(GameRoom).where(GameRoom.saved_run_id == run.id)).all():
        room.closed_at = datetime.now(timezone.utc)
        db.add(room)
    db.commit()

    return "", 204


@app.route("/api/characters", methods=["POST"])
@login_required
@rate_limit("60 per minute")
def create_saved_character():
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "invalid_json", "message": "Request body must be valid JSON."}, 400

    name = data.get("name")
    character_json = data.get("character_json")
    if not isinstance(name, str) or not name.strip():
        return {"error": "invalid_name", "message": "Character save name is required."}, 400
    if not isinstance(character_json, dict):
        return {"error": "invalid_character", "message": "character_json is required and must be an object."}, 400

    try:
        validate_json(character_json, max_bytes=128 * 1024)
    except ValueError as exc:
        return {"error": "invalid_character", "message": str(exc)}, 400
    db = get_db_session()
    db.exec(update(User).where(User.id == current_user.id).values(session_version=User.session_version))
    if len(db.exec(select(SavedCharacter.id).where(SavedCharacter.user_id == current_user.id, SavedCharacter.deleted_at == None)).all()) >= 50:
        return {"error": "save_limit", "message": "Your 50-character library is full."}, 409
    saved = SavedCharacter(
        user_id=current_user.id,
        name=name.strip()[:200],
        character_json=character_json,
    )
    db.add(saved)
    if not storage_available(db, current_user.id, SavedRun, SavedCharacter):
        db.rollback()
        return STORAGE_FULL
    db.commit()
    db.refresh(saved)

    return {
        "id": saved.id,
        "revision": saved.revision,
        "name": saved.name,
        "character_json": saved.character_json,
        "created_at": saved.created_at.isoformat() if saved.created_at else None,
        "updated_at": saved.updated_at.isoformat() if saved.updated_at else None,
        "links": {"self": f"/api/characters/{saved.id}"}
    }, 201


@app.route("/api/characters", methods=["GET"])
@login_required
def api_list_saved_characters():
    limit = request.args.get("limit", default=50, type=int)
    if not (1 <= limit <= 100):
        limit = 50
    db = get_db_session()
    characters = db.exec(
        select(SavedCharacter)
        .where(SavedCharacter.user_id == current_user.id, SavedCharacter.deleted_at == None)
        .order_by(SavedCharacter.updated_at.desc())
        .limit(limit)
    ).all()

    return {
        "results": [
            {
                "id": character.id,
                "revision": character.revision,
                "name": character.name,
                "created_at": character.created_at.isoformat() if character.created_at else None,
                "updated_at": character.updated_at.isoformat() if character.updated_at else None,
                "links": {"self": f"/api/characters/{character.id}"}
            }
            for character in characters
        ],
        "error": None
    }, 200


@app.route("/api/characters/<int:character_id>", methods=["GET"])
@login_required
def get_saved_character(character_id):
    db = get_db_session()
    saved = db.exec(select(SavedCharacter).where(SavedCharacter.id == character_id)).first()

    if saved is None or saved.user_id != current_user.id or saved.deleted_at:
        return {"error": "not_found", "message": "Saved character not found."}, 404

    return {
        "id": saved.id,
        "revision": saved.revision,
        "name": saved.name,
        "character_json": saved.character_json,
        "created_at": saved.created_at.isoformat() if saved.created_at else None,
        "updated_at": saved.updated_at.isoformat() if saved.updated_at else None
    }, 200


# ---------------------------------------------------------------------------
# Routes — multiplayer host links (CONTRACTS.md §16)
#
# Security properties (§16.3-§16.6):
# - invite codes from secrets.token_urlsafe(16) (≥128 bits), never row ids
# - 404 (never 403) for unknown/closed/not-joined sessions — no enumeration
# - host-only assignment; non-host members also get 404
# - caps: MAX_PLAYERS_PER_SESSION, MAX_OPEN_SESSIONS_PER_HOST
# - session payloads expose only player-row id / display_name / role /
#   assigned_character_id — never email, oauth ids, or password fields
# ---------------------------------------------------------------------------

MAX_PLAYERS_PER_SESSION = 8
MAX_OPEN_SESSIONS_PER_HOST = 5
SESSION_STALE_AFTER = timedelta(hours=24)


def _generate_invite_code(db) -> str:
    """§16.3: cryptographically random, URL-safe, retried on (unlikely) collision."""
    while True:
        code = secrets.token_urlsafe(16)
        exists = db.exec(
            select(MultiplayerSession).where(MultiplayerSession.invite_code == code)
        ).first()
        if not exists:
            return code


def _default_display_name(user) -> str:
    return (user.display_name or user.username or "Adventurer")[:200]


def _state_character_ids(state_json) -> set:
    chars = state_json.get("characters") if isinstance(state_json, dict) else None
    if not isinstance(chars, list):
        return set()
    return {c.get("id") for c in chars if isinstance(c, dict) and c.get("id")}


def _first_unassigned_character_id(db, mp):
    chars = mp.state_json.get("characters") if isinstance(mp.state_json, dict) else None
    if not isinstance(chars, list):
        return None
    taken_ids = {
        p.assigned_character_id
        for p in db.exec(
            select(MultiplayerPlayer).where(MultiplayerPlayer.session_id == mp.id)
        ).all()
        if p.assigned_character_id
    }
    for character in chars:
        if not isinstance(character, dict):
            continue
        character_id = character.get("id")
        if isinstance(character_id, str) and character_id and character_id not in taken_ids:
            return character_id
    return None


def _coerce_positive_int(value):
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.isdigit():
        parsed = int(value)
        return parsed if parsed > 0 else None
    return None


def _load_open_session(db, invite_code):
    """Return the open session for this code, lazily closing stale ones (§16.6).

    Returns None for unknown or closed sessions — callers map that to 404.
    """
    mp = db.exec(
        select(MultiplayerSession).where(MultiplayerSession.invite_code == invite_code)
    ).first()
    if mp is None or mp.closed_at is not None:
        return None

    players = db.exec(
        select(MultiplayerPlayer).where(MultiplayerPlayer.session_id == mp.id)
    ).all()
    last_activity = max(
        (p.last_seen_at for p in players if p.last_seen_at is not None),
        default=mp.created_at,
    )
    if last_activity is not None:
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - last_activity > SESSION_STALE_AFTER:
            mp.closed_at = datetime.now(timezone.utc)
            db.add(mp)
            db.commit()
            return None
    return mp


def _get_membership(db, mp, user_id):
    return db.exec(
        select(MultiplayerPlayer).where(
            MultiplayerPlayer.session_id == mp.id,
            MultiplayerPlayer.user_id == user_id,
        )
    ).first()


def _session_view(db, mp, requester):
    """§16.2 SessionView. Exposes only the contracted player fields (§16.5)."""
    requester_role = requester.role if hasattr(requester, "role") else str(requester or "")
    requester_player_id = requester.id if hasattr(requester, "id") else None
    players = db.exec(
        select(MultiplayerPlayer)
        .where(MultiplayerPlayer.session_id == mp.id)
        .order_by(MultiplayerPlayer.joined_at)
    ).all()
    invite_url = f"{request.url_root.rstrip('/')}/site/?session={mp.invite_code}"
    return {
        "id": mp.id,
        "invite_code": mp.invite_code,
        "invite_url": invite_url,
        "role": requester_role,
        "current_player_id": requester_player_id,
        "players": [
            {
                "id": p.id,
                "display_name": p.display_name,
                "role": p.role,
                "assigned_character_id": p.assigned_character_id,
            }
            for p in players
        ],
        "assignments": [
            {"player_id": p.id, "character_id": p.assigned_character_id}
            for p in players
            if p.assigned_character_id
        ],
        "state_json": mp.state_json,
        "error": None,
    }


def _json_body_or_none(required: bool):
    """400-invalid_json helper: wrong content type or malformed JSON → None."""
    data = request.get_json(silent=True)
    if data is None:
        if required or request.data:
            return None
        return {}
    if not isinstance(data, dict):
        return None
    return data


_NOT_FOUND = ({"error": "not_found", "message": "Multiplayer session not found."}, 404)
_INVALID_JSON = ({"error": "invalid_json", "message": "Request body must be valid JSON."}, 400)


@app.route("/api/multiplayer/sessions", methods=["POST"])
@login_required
@rate_limit("10 per minute")
def create_multiplayer_session():
    data = _json_body_or_none(required=True)
    if data is None:
        return _INVALID_JSON

    seed = data.get("seed")
    level = data.get("level")
    state_json = data.get("state_json")
    host_character_id = data.get("host_character_id")

    if seed is None or not isinstance(seed, int):
        return {"error": "invalid_json", "message": "Seed is required and must be an integer."}, 400
    if level is None or not isinstance(level, int) or not (1 <= level <= 10):
        return {"error": "invalid_level", "message": "Level is required and must be between 1 and 10."}, 400
    if not isinstance(state_json, dict):
        return {"error": "invalid_state", "message": "state_json is required and must be an object."}, 400

    db = get_db_session()

    open_sessions = db.exec(
        select(MultiplayerSession).where(
            MultiplayerSession.host_user_id == current_user.id,
            MultiplayerSession.closed_at == None,  # noqa: E711 — SQL NULL check
        )
    ).all()
    if len(open_sessions) >= MAX_OPEN_SESSIONS_PER_HOST:
        return {"error": "too_many_sessions", "message": "Close an existing session before hosting another."}, 409

    # host_character_id is best-effort: stored only if it names a character in
    # the submitted state (assignment errors are reserved for §16.2 assignments).
    valid_chars = _state_character_ids(state_json)
    if not (isinstance(host_character_id, str) and host_character_id in valid_chars):
        host_character_id = None

    mp = MultiplayerSession(
        host_user_id=current_user.id,
        invite_code=_generate_invite_code(db),
        seed=seed,
        level=level,
        state_json=state_json,
    )
    db.add(mp)
    db.commit()
    db.refresh(mp)

    db.add(MultiplayerPlayer(
        session_id=mp.id,
        user_id=current_user.id,
        display_name=_default_display_name(current_user),
        role="host",
        assigned_character_id=host_character_id,
    ))
    db.commit()

    membership = _get_membership(db, mp, current_user.id)
    return _session_view(db, mp, membership), 201


@app.route("/api/multiplayer/sessions/<invite_code>/join", methods=["POST"])
@login_required
@rate_limit("10 per minute")
def join_multiplayer_session(invite_code):
    data = _json_body_or_none(required=False)
    if data is None:
        return _INVALID_JSON

    db = get_db_session()
    mp = _load_open_session(db, invite_code)
    if mp is None:
        return _NOT_FOUND

    membership = _get_membership(db, mp, current_user.id)
    if membership is not None:
        # §16.2: idempotent re-join — refresh presence, keep existing role/dot.
        membership.last_seen_at = datetime.now(timezone.utc)
        db.add(membership)
        db.commit()
        return _session_view(db, mp, membership), 200

    player_count = len(db.exec(
        select(MultiplayerPlayer).where(MultiplayerPlayer.session_id == mp.id)
    ).all())
    if player_count >= MAX_PLAYERS_PER_SESSION:
        return {"error": "session_full", "message": "This session is full."}, 409

    display_name = data.get("display_name")
    if not isinstance(display_name, str) or not display_name.strip():
        display_name = _default_display_name(current_user)
    display_name = display_name.strip()[:200]

    # Self-claim at join time: honored only for a real, unclaimed character.
    # Reassignment afterwards is host-only (§16.4).
    character_id = data.get("character_id")
    if isinstance(character_id, str) and character_id in _state_character_ids(mp.state_json):
        taken = db.exec(
            select(MultiplayerPlayer).where(
                MultiplayerPlayer.session_id == mp.id,
                MultiplayerPlayer.assigned_character_id == character_id,
            )
        ).first()
        if taken is not None:
            character_id = None
    else:
        character_id = None
    if character_id is None:
        character_id = _first_unassigned_character_id(db, mp)

    db.add(MultiplayerPlayer(
        session_id=mp.id,
        user_id=current_user.id,
        display_name=display_name,
        role="player",
        assigned_character_id=character_id,
    ))
    db.commit()

    membership = _get_membership(db, mp, current_user.id)
    return _session_view(db, mp, membership), 200


@app.route("/api/multiplayer/sessions/<invite_code>", methods=["GET"])
@login_required
def get_multiplayer_session(invite_code):
    db = get_db_session()
    mp = _load_open_session(db, invite_code)
    if mp is None:
        return _NOT_FOUND

    membership = _get_membership(db, mp, current_user.id)
    if membership is None:
        # §16.2: knowing the code is not enough — non-members get 404.
        return _NOT_FOUND

    membership.last_seen_at = datetime.now(timezone.utc)
    db.add(membership)
    db.commit()

    return _session_view(db, mp, membership), 200


@app.route("/api/multiplayer/sessions/<invite_code>/state", methods=["PUT"])
@login_required
@rate_limit("120 per minute")
def update_multiplayer_session_state(invite_code):
    data = _json_body_or_none(required=True)
    if data is None:
        return _INVALID_JSON

    state_json = data.get("state_json")
    if not isinstance(state_json, dict):
        return {"error": "invalid_state", "message": "state_json is required and must be an object."}, 400

    db = get_db_session()
    mp = _load_open_session(db, invite_code)
    if mp is None:
        return _NOT_FOUND

    membership = _get_membership(db, mp, current_user.id)
    if membership is None or membership.role != "host":
        return _NOT_FOUND

    mp.state_json = state_json
    mp.updated_at = datetime.now(timezone.utc)
    membership.last_seen_at = datetime.now(timezone.utc)
    db.add(mp)
    db.add(membership)
    db.commit()

    return _session_view(db, mp, membership), 200


@app.route("/api/multiplayer/sessions/<invite_code>/assignments", methods=["POST"])
@login_required
@rate_limit("60 per minute")
def assign_multiplayer_character(invite_code):
    data = _json_body_or_none(required=True)
    if data is None:
        return _INVALID_JSON

    db = get_db_session()
    mp = _load_open_session(db, invite_code)
    if mp is None:
        return _NOT_FOUND

    membership = _get_membership(db, mp, current_user.id)
    # §16.4: non-members AND non-host members both get 404 (no role leakage).
    if membership is None or membership.role != "host":
        return _NOT_FOUND

    player_id = data.get("player_id")
    character_id = data.get("character_id")
    submitted_state = data.get("state_json")

    if isinstance(submitted_state, dict):
        mp.state_json = submitted_state
        mp.updated_at = datetime.now(timezone.utc)
        db.add(mp)

    target = None
    parsed_player_id = _coerce_positive_int(player_id)
    if parsed_player_id is not None:
        target = db.exec(
            select(MultiplayerPlayer).where(
                MultiplayerPlayer.id == parsed_player_id,
                MultiplayerPlayer.session_id == mp.id,
            )
        ).first()
    if target is None or not isinstance(character_id, str) or character_id not in _state_character_ids(mp.state_json):
        return {"error": "invalid_assignment", "message": "Unknown player or character for this session."}, 400

    # Reassignment: a character belongs to at most one player.
    holders = db.exec(
        select(MultiplayerPlayer).where(
            MultiplayerPlayer.session_id == mp.id,
            MultiplayerPlayer.assigned_character_id == character_id,
        )
    ).all()
    for holder in holders:
        if holder.id != target.id:
            holder.assigned_character_id = None
            db.add(holder)

    target.assigned_character_id = character_id
    membership.last_seen_at = datetime.now(timezone.utc)
    db.add(target)
    db.add(membership)
    db.commit()

    view = _session_view(db, mp, membership)
    return {"ok": True, "players": view["players"], "assignments": view["assignments"], "error": None}, 200


@app.route("/api/random-tables", methods=["GET"])
def get_random_tables():
    """Serve the bundled dungeon tables without depending on an external host."""
    table_type = request.args.get("type", default="monsters")

    if table_type not in ["monsters", "traps"]:
        return jsonify({"error": "invalid_table", "message": "Invalid table type."}), 400

    if table_type == "traps":
        table_filename = "traps.json"
    else:
        # Default to level 1; each accepted level maps to its own bundled table.
        try:
            level = int(request.args.get("level", default="1"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_level", "message": "Level must be an integer between 1 and 10."}), 400
        if not (1 <= level <= 10):
            return jsonify({"error": "invalid_level", "message": "Level must be an integer between 1 and 10."}), 400
        table_filename = f"monsters-{level}.json"

    try:
        data = json.loads((S3_CONTENT_DIR / table_filename).read_text(encoding="utf-8"))
        if not isinstance(data, list) or not data or not all(isinstance(row, dict) for row in data):
            raise ValueError("Dungeon table must contain a non-empty list of objects")
    except (OSError, ValueError):
        app.logger.exception("Unable to load dungeon table %s", table_filename)
        return jsonify({"error": "table_unavailable", "results": [], "message": "Dungeon table temporarily unavailable."}), 503

    return jsonify({
        "results": data,
        "source": url_for("serve_s3_content", filename=table_filename),
        "error": None,
    }), 200


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

from rooms import register_room_routes
register_room_routes(app, engine, User, SavedRun, SavedCharacter, rate_limit)
from account_security import register_account_routes
register_account_routes(app, engine, User, SavedRun, SavedCharacter, rate_limit)

if __name__ == "__main__":
    # If running locally via python app.py, default to debug mode.
    # Production running containers will use Gunicorn directly, bypassing this block entirely.
    is_prod = os.environ.get("FLASK_ENV") == "production"
    app.run(host="0.0.0.0", port=5000, debug=not is_prod)
