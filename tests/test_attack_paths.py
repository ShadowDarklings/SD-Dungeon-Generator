# tests/test_attack_paths.py
#
# Asserts that nginx returns 404/403 for known-bad scanner paths.
# Adapted from Study Guide §10.
#
# Run with the stack up:
#   docker compose up -d
#   pytest tests/test_attack_paths.py -v

import json

import pytest
import requests
import urllib3

# Suppress the InsecureRequestWarning for the self-signed cert
urllib3.disable_warnings()

with open("attack_paths.json") as f:
    PATHS = json.load(f)

BASE = "https://localhost"


@pytest.mark.parametrize("path", PATHS)
def test_nginx_blocks(path):
    """nginx should return 404/403 for known-bad attack paths."""
    r = requests.get(BASE + path, verify=False)
    assert r.status_code in (404, 403), (
        f"{path} returned {r.status_code} — nginx let it through"
    )


def test_flask_never_saw_any_of_them():
    """Verify Flask's access log never logged these requests at all."""
    try:
        log_contents = open("logs/flask.log").read()
    except FileNotFoundError:
        pytest.skip("flask.log not present (run gunicorn with accesslog=logs/flask.log)")
    for path in PATHS:
        assert path not in log_contents, f"Flask saw {path} — nginx didn't block it"
