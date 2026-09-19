import json

import import_service


def test_private_import_service_returns_character(monkeypatch):
    monkeypatch.setattr(
        import_service,
        "run_shadowdarklings_import_worker",
        lambda base_classes_only=False: json.dumps({"name": "Isolated", "base": base_classes_only}),
    )

    with import_service.app.test_client() as client:
        response = client.post("/import", json={"base_classes_only": True})

    assert response.status_code == 200
    assert json.loads(response.get_json()["character_json"])["base"] is True


def test_private_import_service_rejects_invalid_payload():
    with import_service.app.test_client() as client:
        response = client.post("/import", json={"base_classes_only": "yes"})

    assert response.status_code == 400
    assert response.is_json
