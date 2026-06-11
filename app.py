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
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from flask import (
    Flask, render_template, request, redirect, url_for, session, flash, g,
    send_from_directory, abort, jsonify,
)
from sqlmodel import SQLModel, Field, Session, create_engine, select, delete
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import (
    LoginManager, UserMixin, login_user, logout_user, login_required, current_user
)
from sqlalchemy import (
    Column, JSON, DateTime, UniqueConstraint, Integer, ForeignKey, String, CheckConstraint
)
from dotenv import load_dotenv
from authlib.integrations.flask_client import OAuth
from flask_wtf.csrf import CSRFProtect, CSRFError

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
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

app.config["SECRET_KEY"] = SECRET_KEY
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=2)
app.config["REMEMBER_COOKIE_DURATION"] = timedelta(days=14)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# MEGAN'S HARDENING: Secure cookies now activate in production over true HTTPS!
if os.environ.get("FLASK_ENV") == "production":
    app.config["SESSION_COOKIE_SECURE"] = True
else:
    app.config["SESSION_COOKIE_SECURE"] = False

csrf = CSRFProtect(app)

@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    return jsonify({"error": "csrf_invalid", "message": "CSRF validation failed."}), 400

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

@login_manager.unauthorized_handler
def unauthorized():
    if request.path.startswith("/api/"):
        return {"error": "login_required", "message": "Authentication required."}, 401
    return redirect(url_for("login"))


# Initialize Engines
engine = create_engine(DATABASE_URL, echo=False)
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
    """Create the SQLModel tables if they are missing."""
    SQLModel.metadata.create_all(engine)


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
bootstrap_database()


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
    return db.get(User, int(user_id))


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

    session.permanent = True
    login_user(user)
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
    return redirect(url_for("home"))


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return redirect(url_for("home"))


@app.route("/login/github")
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
    github_id = str(profile.get("id"))
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
        db.add(OAuthIdentity(
            user_id=user.id,
            provider="github",
            provider_user_id=github_id,
            provider_login=github_login,
        ))
        db.commit()
        session.permanent = True
        login_user(user)
        return redirect(url_for("list_runs_page"))

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


@app.route("/api/shadowdarklings/import", methods=["POST"])
@login_required
@csrf.exempt
def import_shadowdarklings_character():
    # login_required: this endpoint launches a headless browser server-side —
    # anonymous access would be a trivial resource-exhaustion (DoS) vector.
    #
    # Dev-only feature (CONTRACTS.md §2, §17 item 6): the production image does
    # not ship Playwright browsers, so the feature is cleanly disabled there
    # instead of failing with a 502 mid-request.
    if not app.config.get("SHADOWDARKLINGS_IMPORT_ENABLED", os.environ.get("FLASK_ENV") != "production"):
        return {
            "error": "feature_disabled",
            "message": "Character import is not available in this environment.",
        }, 503

    try:
        data = request.get_json(silent=True) or {}
        base_classes_only = bool(data.get("base_classes_only", False))
        character_json = fetch_shadowdarklings_character_json(base_classes_only=base_classes_only)
    except Exception as exc:
        return {"error": "shadowdarklings_import_failed", "message": str(exc)}, 502

    return {
        "source": "shadowdarklings",
        "character_json": character_json,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }, 200



# ---------------------------------------------------------------------------
# Saved Runs Relational DB Populate Helper
# ---------------------------------------------------------------------------

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
        entity = Entity(saved_run_id=run.id, entity_key=e.get("id"), kind=e.get("kind"), name=e.get("name"), x=e.get("x"), y=e.get("y"), defeated=bool(e.get("defeated", False)), collected=bool(e.get("collected", False)), revealed=bool(e.get("revealed", False)), triggered=bool(e.get("triggered", False)), value=e.get("value"))
        db.add(entity)
        
    loot_data = state.get("lootLog", {}).get("entries", [])
    for l in loot_data:
        loot = LootEntry(saved_run_id=run.id, name=l.get("name"), value=l.get("value", 0), origin_tile=l.get("originTile", {"x": 0, "y": 0}))
        db.add(loot)
        
    db.commit()


SHADOWDARKLINGS_SOURCE_SWITCHES = [
    "Scroll #1",
    "Scroll #2",
    "Scroll #3",
    "Scroll #4",
    "B&R&K",
    "Roustabout",
    "Unnatural Selection",
    "Darcy",
]


def set_shadowdarklings_source_switches(page, enabled: bool) -> None:
    """Set the optional ShadowDarklings source switches to a consistent state."""
    for label in SHADOWDARKLINGS_SOURCE_SWITCHES:
        switch = page.get_by_role("switch", name=label)
        try:
            switch.set_checked(enabled)
        except Exception:
            # Some source switches may be disabled by the site; skip those safely.
            continue


def fetch_shadowdarklings_character_json(base_classes_only: bool = False) -> str:
    """Generate a ShadowDarklings character and capture the exported JSON from the live site."""
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 1440})
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=SHADOWDARKLINGS_CREATE_URL)
            page = context.new_page()
            page.goto(SHADOWDARKLINGS_CREATE_URL, wait_until="networkidle")
            page.get_by_role("button", name="Random 1").click()
            page.get_by_role("button", name="Best Fit").click()
            set_shadowdarklings_source_switches(page, not base_classes_only)
            page.get_by_role("button", name="Generate a Random Character").click()
            page.get_by_role("button", name="JSON").click()
            page.wait_for_timeout(750)
            clipboard_text = str(page.evaluate("navigator.clipboard.readText()")).strip()
            if not clipboard_text:
                raise RuntimeError("ShadowDarklings export did not return character JSON.")
            return clipboard_text
    except Exception as exc:
        raise RuntimeError(f"ShadowDarklings import failed: {exc}") from exc


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
    return render_template("runs.html", runs=runs)


@app.route("/api/runs", methods=["POST"])
@login_required
@csrf.exempt
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
        
    db = get_db_session()
    
    run = SavedRun(user_id=current_user.id, seed=seed, level=level, state_json=state_json)
    db.add(run)
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
    
    # Enforce BOLA OWASP A01 Rule: 404 instead of 403 (§4)
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
@csrf.exempt
def update_run(run_id):
    data = request.get_json(silent=True)
    if data is None:
        return {"error": "invalid_json", "message": "Request body must be valid JSON."}, 400
        
    db = get_db_session()
    run = db.exec(select(SavedRun).where(SavedRun.id == run_id)).first()
    
    # Enforce BOLA OWASP A01 Rule: 404 instead of 403 (§4)
    if run is None or run.user_id != current_user.id:
        return {"error": "not_found", "message": "Saved run not found."}, 404
        
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
        
    run.state_json = state_json
    run.updated_at = datetime.now(timezone.utc)
    
    db.add(run)
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
        "seed": run.seed,
        "level": run.level,
        "state_json": run.state_json,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None
    }, 200


@app.route("/api/runs/<int:run_id>", methods=["DELETE"])
@login_required
@csrf.exempt
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


def _session_view(db, mp, requester_role):
    """§16.2 SessionView. Exposes only the contracted player fields (§16.5)."""
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
@csrf.exempt
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

    return _session_view(db, mp, "host"), 201


@app.route("/api/multiplayer/sessions/<invite_code>/join", methods=["POST"])
@login_required
@csrf.exempt
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
        return _session_view(db, mp, membership.role), 200

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

    db.add(MultiplayerPlayer(
        session_id=mp.id,
        user_id=current_user.id,
        display_name=display_name,
        role="player",
        assigned_character_id=character_id,
    ))
    db.commit()

    return _session_view(db, mp, "player"), 200


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

    return _session_view(db, mp, membership.role), 200


@app.route("/api/multiplayer/sessions/<invite_code>/assignments", methods=["POST"])
@login_required
@csrf.exempt
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

    target = None
    if isinstance(player_id, int):
        target = db.exec(
            select(MultiplayerPlayer).where(
                MultiplayerPlayer.id == player_id,
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

    view = _session_view(db, mp, "host")
    return {"ok": True, "players": view["players"], "assignments": view["assignments"], "error": None}, 200


@app.route("/api/random-tables", methods=["GET"])
def get_random_tables():
    """Proxies requests to the team's external S3 bucket to fetch random dungeon tables."""
    table_type = request.args.get("type", default="monsters")

    if table_type not in ["monsters", "traps"]:
        return jsonify({"error": "invalid_table", "message": "Invalid table type."}), 400

    if table_type == "traps":
        s3_bucket_url = "http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/traps.json"
    else:
        # Contract §2/§3a (Final Project revision): level is required for
        # monsters, must be 1-10, and maps to the per-level table
        # monsters-<level>.json. The Week 6 two-table mapping is retired.
        try:
            level = int(request.args.get("level", default="1"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_level", "message": "Level must be an integer between 1 and 10."}), 400
        if not (1 <= level <= 10):
            return jsonify({"error": "invalid_level", "message": "Level must be an integer between 1 and 10."}), 400
        s3_bucket_url = f"http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-{level}.json"

    try:
        response = requests.get(s3_bucket_url, timeout=3.0)
        response.raise_for_status()
        data = response.json()
        return jsonify({"results": data, "source": s3_bucket_url, "error": None}), 200
    except requests.exceptions.Timeout:
        return jsonify({"error": "timeout", "results": [], "message": "Dungeon table temporarily unavailable."}), 503
    except requests.exceptions.HTTPError as error:
        if error.response is not None and error.response.status_code == 429:
            return jsonify({"error": "rate_limited", "results": [], "message": "Dungeon table temporarily unavailable."}), 503
        return jsonify({"error": "upstream_invalid", "results": [], "message": "Dungeon table response was not usable."}), 503
    except (requests.exceptions.RequestException, ValueError):
        return jsonify({"error": "upstream_invalid", "results": [], "message": "Dungeon table response was not usable."}), 503


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # If running locally via python app.py, default to debug mode.
    # Production running containers will use Gunicorn directly, bypassing this block entirely.
    is_prod = os.environ.get("FLASK_ENV") == "production"
    app.run(host="0.0.0.0", port=5000, debug=not is_prod)
