"""
Week 6 Front-End Role Tests — Saved Runs UI (Owner: Front-end, Dungeon Master)

These tests verify the structure and selectors for the save/load UI in the
static dungeon client. They avoid copy-specific assertions so the UI text can
change without breaking the tests.
"""

import os

# Environment config must be set before importing app.py
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret"

from bs4 import BeautifulSoup
from sqlmodel import SQLModel
from app import app, engine


def build_client():
    app.config["TESTING"] = True
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    return app.test_client()


def test_site_home_has_save_load_controls():
    """/site/ renders save/load buttons with stable IDs."""
    with build_client() as client:
        response = client.get("/site/")
    assert response.status_code == 200
    soup = BeautifulSoup(response.data, "html.parser")
    assert soup.select_one("#save-btn") is not None
    assert soup.select_one("#load-btn") is not None
    assert soup.select_one(".save-load-controls") is not None


def test_save_load_modal_structure_exists():
    """Save/load modal contains required structure for runs list and controls."""
    with build_client() as client:
        response = client.get("/site/")
    assert response.status_code == 200
    soup = BeautifulSoup(response.data, "html.parser")

    modal = soup.select_one("#save-load-modal")
    assert modal is not None
    assert modal.select_one("#save-load-title") is not None
    assert modal.select_one("#save-load-status") is not None
    assert modal.select_one("#save-name-input") is not None
    assert modal.select_one("#saved-runs-list") is not None
    assert modal.select_one("[data-testid='saved-runs-list']") is not None
    assert modal.select_one("#save-modal-submit") is not None
    assert modal.select_one("#save-load-close") is not None


def test_overwrite_and_replace_confirmations_present():
    """Overwrite and replace confirmation panels exist for save/load flows."""
    with build_client() as client:
        response = client.get("/site/")
    assert response.status_code == 200
    soup = BeautifulSoup(response.data, "html.parser")

    overwrite = soup.select_one("#overwrite-confirmation")
    replace = soup.select_one("#replace-confirmation")
    assert overwrite is not None
    assert replace is not None
    assert overwrite.select_one("#overwrite-confirm-btn") is not None
    assert overwrite.select_one("#overwrite-cancel-btn") is not None
    assert replace.select_one("#replace-confirm-btn") is not None
    assert replace.select_one("#replace-cancel-btn") is not None


def test_multiplayer_controls_and_modal_structure_exist():
    """/site/ exposes stable multiplayer selectors for host-link flow."""
    with build_client() as client:
        response = client.get("/site/")
    assert response.status_code == 200
    soup = BeautifulSoup(response.data, "html.parser")

    assert soup.select_one("#multiplayer-btn") is not None

    modal = soup.select_one("#multiplayer-modal")
    assert modal is not None
    assert modal.select_one("#multiplayer-title") is not None
    assert modal.select_one("#multiplayer-status") is not None
    assert modal.select_one("#multiplayer-create-host-btn") is not None
    assert modal.select_one("#multiplayer-invite-link") is not None
    assert modal.select_one("#multiplayer-copy-link-btn") is not None
    assert modal.select_one("#multiplayer-join-code") is not None
    assert modal.select_one("#multiplayer-join-btn") is not None
    assert modal.select_one("#multiplayer-presence-list") is not None
    assert modal.select_one("[data-testid='multiplayer-presence-list']") is not None
    assert modal.select_one("#multiplayer-player-select") is not None
    assert modal.select_one("#multiplayer-character-select") is not None
    assert modal.select_one("#multiplayer-assign-btn") is not None
    assert modal.select_one("#multiplayer-refresh-btn") is not None
    assert modal.select_one("#multiplayer-close") is not None
