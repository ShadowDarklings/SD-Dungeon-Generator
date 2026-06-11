"""
Owner: Backend Role (Megan)
Contract: Test 5 — External/static random table failure envelope.
"""
import pytest
import responses
import requests
from app import app as flask_app

@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as client:
        yield client

@responses.activate
def test_backend_proxy_handles_upstream_timeout(client):
    """Verifies that an external S3 timeout returns a clean 503 envelope."""
    target_url = "http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-1.json"
    responses.add(responses.GET, target_url, body=requests.exceptions.Timeout("Connection timed out"))
    
    response = client.get("/api/random-tables?level=1&type=monsters")
    
    assert response.status_code == 503
    json_data = response.get_json()
    assert json_data["error"] == "timeout"
    assert json_data["results"] == []

@responses.activate
def test_backend_proxy_handles_malformed_json(client):
    """Verifies that corrupt/malformed data upstream triggers a 503 envelope."""
    target_url = "http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-1.json"
    responses.add(responses.GET, target_url, body="!!!CORRUPTED NON-JSON STRING!!!", status=200)
    
    response = client.get("/api/random-tables?level=1&type=monsters")
    
    assert response.status_code == 503
    json_data = response.get_json()
    assert json_data["error"] == "upstream_invalid"
    assert json_data["results"] == []
def test_backend_proxy_rejects_invalid_level(client):
    """Contract §2: monsters requires level 1-10; out-of-range or non-integer → 400 invalid_level."""
    for bad in ("99", "0", "abc"):
        response = client.get(f"/api/random-tables?level={bad}&type=monsters")
        assert response.status_code == 400
        assert response.get_json()["error"] == "invalid_level"

@responses.activate
def test_backend_proxy_serves_per_level_tables(client):
    """Contract §3a (Final Project): level N → monsters-N.json."""
    for level in (1, 7, 10):
        target_url = f"http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-{level}.json"
        responses.add(responses.GET, target_url, json=[{"name": f"Lv{level} Gnoll"}], status=200)

        response = client.get(f"/api/random-tables?level={level}&type=monsters")

        assert response.status_code == 200
        json_data = response.get_json()
        assert json_data["source"].endswith(f"monsters-{level}.json")
        assert json_data["results"] == [{"name": f"Lv{level} Gnoll"}]
