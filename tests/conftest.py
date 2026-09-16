"""Pytest discovery anchor — also ensures the repo root is on sys.path so
`from app import app, db` works from the tests/ directory."""

import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("OAUTH_CLIENT_ID", "test-client-id")
os.environ.setdefault("OAUTH_CLIENT_SECRET", "test-client-secret")


@pytest.fixture(autouse=True)
def disable_rate_limits_for_tests():
    import app as app_module

    original = app_module.app.config.get("RATELIMIT_ENABLED", True)
    original_csrf = app_module.app.config.get("WTF_CSRF_ENABLED", True)
    app_module.app.config["RATELIMIT_ENABLED"] = False
    # Permission-focused tests use direct clients; token tests explicitly enable CSRF.
    app_module.app.config["WTF_CSRF_ENABLED"] = False
    try:
        yield
    finally:
        app_module.app.config["RATELIMIT_ENABLED"] = original
        app_module.app.config["WTF_CSRF_ENABLED"] = original_csrf
