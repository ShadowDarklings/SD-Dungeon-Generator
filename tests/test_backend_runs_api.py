"""
Owner: Backend Role (Megan)
Contract: Test 3 — Create saved run endpoint contract.
"""
import pytest
from app import app as flask_app

@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as client:
        yield client

def test_create_saved_run_endpoint_contract(client):
    """Logged-in POST /api/runs returns 201 with saved metadata."""
    # We fake an active session for the test
    with client.session_transaction() as sess:
        sess["user_id"] = 1

    payload = {
        "seed": "123456",
        "level": 1,
        "state_json": {"tiles": [], "rooms": []}
    }
    
    response = client.post("/api/runs", json=payload)
    
    # Asserting the contract expectations
    assert response.status_code == 201, "Endpoint /api/runs not implemented yet."