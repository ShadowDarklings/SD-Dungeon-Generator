from pathlib import Path
import runpy


def test_importer_has_no_application_startup_hooks(monkeypatch):
    for name in ("SECRET_KEY", "DATABASE_URL", "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET"):
        monkeypatch.delenv(name, raising=False)
    root = Path(__file__).resolve().parents[1]
    config = runpy.run_path(str(root / "importer_gunicorn.conf.py"))
    assert config["bind"] == "0.0.0.0:9000"
    assert config["workers"] == 1
    assert config["threads"] == 2
    assert config["timeout"] == 45
    assert "post_fork" not in config
    assert "preload_app" not in config
    assert '"-c", "importer_gunicorn.conf.py"' in (root / "docker-compose.yml").read_text()
