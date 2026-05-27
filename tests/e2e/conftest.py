"""
Playwright e2e test fixtures (Week 7).

Starts a live Flask server with:
- TESTING = True (enables the /test/login/<username> backdoor)
- SQLite in-memory DB (hermetic, no Postgres dependency)
- SESSION_COOKIE_SECURE = False (test server runs over HTTP)
"""

import os
import sys
import threading
import time
import tempfile
import pytest

# Ensure repo root is on sys.path so `from app import ...` works.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Override DATABASE_URL BEFORE importing app — SQLite for test isolation.
_test_db = os.path.join(tempfile.gettempdir(), "test_e2e.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db}"


@pytest.fixture(scope="session")
def live_server():
    """Start the Flask app in a background thread and yield its base URL."""
    from app import app, engine
    from sqlmodel import SQLModel

    # Test configuration
    app.config["TESTING"] = True
    app.config["SESSION_COOKIE_SECURE"] = False
    app.config["WTF_CSRF_ENABLED"] = True
    app.config["SERVER_NAME"] = None

    # Create all tables in the test SQLite DB
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

    host = "127.0.0.1"
    port = 5099  # Use a non-standard port to avoid conflicts

    server_thread = threading.Thread(
        target=lambda: app.run(host=host, port=port, use_reloader=False),
        daemon=True,
    )
    server_thread.start()

    # Wait for the server to be ready
    base_url = f"http://{host}:{port}"
    for _ in range(30):
        try:
            import urllib.request
            urllib.request.urlopen(f"{base_url}/")
            break
        except Exception:
            time.sleep(0.2)

    class LiveServer:
        url = base_url

    yield LiveServer()
