import io
import subprocess
import pytest
import shadowdarklings_import as importer


def test_import_worker_does_not_inherit_application_secrets(monkeypatch):
    observed = {}
    class Process:
        returncode = 0
        stdout = io.BytesIO()
        stderr = io.BytesIO()
        def __init__(self, command, **options):
            observed.update(command=command, **options)
        def communicate(self, timeout):
            assert timeout == 30
            return b'{"name":"Example"}', None
        def poll(self):
            return 0
    monkeypatch.setenv("DATABASE_URL", "must-not-reach-browser")
    monkeypatch.setenv("SECRET_KEY", "must-not-reach-browser")
    monkeypatch.setenv("OAUTH_CLIENT_SECRET", "must-not-reach-browser")
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setattr(importer.subprocess, "Popen", Process)
    assert importer.fetch_shadowdarklings_character_json(True) == '{"name":"Example"}'
    assert not {"DATABASE_URL", "SECRET_KEY", "OAUTH_CLIENT_SECRET"}.intersection(observed["env"])
    assert observed["env"]["SD_IMPORT_SANDBOX"] == "1"
    assert observed["env"]["SD_IMPORT_ISOLATED_PROCESS"] == "1"
    assert "--base-only" in observed["command"]


def test_import_timeout_stops_its_worker(monkeypatch):
    stopped = []
    class Process:
        stdout = io.BytesIO()
        stderr = io.BytesIO()
        def communicate(self, timeout):
            raise subprocess.TimeoutExpired("import-worker", timeout)
    process = Process()
    monkeypatch.setattr(importer.subprocess, "Popen", lambda *args, **kwargs: process)
    monkeypatch.setattr(importer, "stop_import_process", lambda target, **kwargs: stopped.append(target))
    with pytest.raises(RuntimeError, match="timed out"):
        importer.fetch_shadowdarklings_character_json()
    assert process in stopped


def test_failed_linux_worker_cleans_its_remaining_process_group(monkeypatch):
    killed = []

    class Process:
        pid = 321
        returncode = 1

        def poll(self):
            return self.returncode

        def wait(self, timeout):
            return self.returncode

    monkeypatch.setattr(importer.os, "name", "posix")
    monkeypatch.setattr(importer.os, "killpg", lambda pid, sig: killed.append((pid, sig)), raising=False)
    monkeypatch.setattr(importer.signal, "SIGKILL", 9, raising=False)

    importer.stop_import_process(Process(), force_tree=True)

    assert killed == [(321, 9)]
