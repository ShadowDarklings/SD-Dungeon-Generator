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
    target_url = "https://maximumminiatures-oss.s3.amazonaws.com/tables/level_1_monsters.json"
    responses.add(responses.GET, target_url, body=requests.exceptions.Timeout("Connection timed out"))
    
    response = client.get("/api/random-tables?level=1&type=monsters")
    
    assert response.status_code == 503
    json_data = response.get_json()
    assert json_data["error"] == "timeout"
    assert json_data["results"] == []

@responses.activate
def test_backend_proxy_handles_malformed_json(client):
    """Verifies that corrupt/malformed data upstream triggers a 503 envelope."""
    target_url = "https://maximumminiatures-oss.s3.amazonaws.com/tables/level_1_monsters.json"
    responses.add(responses.GET, target_url, body="!!!CORRUPTED NON-JSON STRING!!!", status=200)
    
    response = client.get("/api/random-tables?level=1&type=monsters")
    
    assert response.status_code == 503
    json_data = response.get_json()
    assert json_data["error"] == "upstream_invalid"
    assert json_data["results"] == []