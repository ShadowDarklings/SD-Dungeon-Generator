"""Random-table contract and AWS-independent operation."""
import pytest
import requests

import app as app_module


@pytest.fixture
def client(monkeypatch):
    def reject_network(*args, **kwargs):
        pytest.fail("The random-table API must not make outbound HTTP requests")

    monkeypatch.setattr(requests.sessions.Session, "request", reject_network)
    monkeypatch.setitem(app_module.app.config, "TESTING", True)
    with app_module.app.test_client() as client:
        yield client


@pytest.mark.parametrize("level,count", enumerate([19, 34, 33, 28, 17, 25, 13, 18, 13, 27], start=1))
def test_monster_tables_work_without_network(client, level, count):
    response = client.get(f"/api/random-tables?type=monsters&level={level}")
    assert response.status_code == 200
    payload = response.get_json()
    assert set(payload) == {"results", "source", "error"}
    assert payload["error"] is None
    assert payload["source"] == f"/site/monsters-{level}.json"
    assert len(payload["results"]) == count
    assert all(row["Monster Name"] for row in payload["results"])
    assert client.get(payload["source"]).get_json() == payload["results"]


def test_trap_table_works_without_network(client):
    response = client.get("/api/random-tables?type=traps")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["source"] == "/site/traps.json"
    assert payload["error"] is None
    assert len(payload["results"]) == 12
    assert payload["results"][0] == {
        "roll": 1, "name": "Crossbow", "trigger": "Tripwire", "effect": "1d6"
    }
    assert client.get(payload["source"]).get_json() == payload["results"]


def test_default_is_level_one_monsters(client):
    assert client.get("/api/random-tables").get_json() == client.get(
        "/api/random-tables?type=monsters&level=1"
    ).get_json()


@pytest.mark.parametrize("level", ["0", "11", "-1", "abc", "1.5", "", "../../app.py"])
def test_invalid_monster_level(client, level):
    response = client.get("/api/random-tables", query_string={"type": "monsters", "level": level})
    assert response.status_code == 400
    assert response.get_json()["error"] == "invalid_level"


@pytest.mark.parametrize("table_type", ["", "spells", "../../app.py"])
def test_invalid_table_type(client, table_type):
    response = client.get("/api/random-tables", query_string={"type": table_type})
    assert response.status_code == 400
    assert response.get_json()["error"] == "invalid_table"


@pytest.mark.parametrize("contents", [None, "not json", "{}", "[]", '["invalid row"]', b"\xff"])
def test_missing_or_corrupt_table_returns_clean_failure(client, monkeypatch, tmp_path, contents):
    monkeypatch.setattr(app_module, "S3_CONTENT_DIR", tmp_path)
    if contents is not None:
        (tmp_path / "traps.json").write_bytes(contents if isinstance(contents, bytes) else contents.encode())
    response = client.get("/api/random-tables?type=traps")
    assert response.status_code == 503
    assert response.get_json() == {
        "error": "table_unavailable", "results": [], "message": "Dungeon table temporarily unavailable."
    }
