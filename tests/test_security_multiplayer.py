"""Legacy multiplayer cannot bypass the authoritative room API.

Room access, ownership, presence, invitations and command regressions live in
test_rooms.py. The former full-state-upload endpoints are deliberately retired.
"""
import pytest
from app import app

@pytest.mark.parametrize("method,path", [
    ("post", "/api/multiplayer/sessions"),
    ("post", "/api/multiplayer/sessions/old-code/join"),
    ("get", "/api/multiplayer/sessions/old-code"),
    ("put", "/api/multiplayer/sessions/old-code/state"),
    ("post", "/api/multiplayer/sessions/old-code/assignments"),
])
def test_legacy_multiplayer_is_retired(method, path):
    with app.test_client() as client:
        response = getattr(client, method)(path, json={})
        assert response.status_code == 410
        assert response.json["error"] == "retired_api"
