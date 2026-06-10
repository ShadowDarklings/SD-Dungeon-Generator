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
def test_backend_proxy_maps_levels_2_to_10_to_table_2(client):
    """Contract §3a: level 1 → monsters-1.json, levels 2-10 → monsters-2.json."""
    target_url = "http://charlesreeder-506-hw1.s3-website-us-west-2.amazonaws.com/monsters-2.json"
    responses.add(responses.GET, target_url, json=[{"name": "Gnoll"}], status=200)

    response = client.get("/api/random-tables?level=7&type=monsters")

    assert response.status_code == 200
    json_data = response.get_json()
    assert json_data["source"].endswith("monsters-2.json")
    assert json_data["results"] == [{"name": "Gnoll"}]
