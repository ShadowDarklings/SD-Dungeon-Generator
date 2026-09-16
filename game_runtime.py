"""Bounded, serialized JSON bridge to the trusted JavaScript rules worker."""

import atexit
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading


class GameRuntimeError(RuntimeError):
    pass


class GameRuntime:
    def __init__(self):
        self._lock = threading.Lock()
        self._process = None
        self._pid = None
        self._responses = None
        atexit.register(self.close)

    def close(self):
        process = self._process
        self._process = None
        if process and self._pid == os.getpid():
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            process.stdin.close()
            process.stdout.close()

    def _start(self):
        if self._process and self._pid == os.getpid() and self._process.poll() is None:
            return
        self.close()
        executable = os.environ.get("GAME_NODE_EXECUTABLE") or shutil.which("node")
        if not executable:
            raise GameRuntimeError("The game rules service requires Node.js.")
        root = Path(__file__).resolve().parent
        self._responses = queue.Queue(maxsize=2)
        child_env = {
            key: value for key, value in os.environ.items()
            if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "LANG"}
        }
        options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        self._process = subprocess.Popen(
            [executable, "--max-old-space-size=256", str(root / "server" / "game_worker.mjs")],
            cwd=root, env=child_env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, encoding="utf-8", bufsize=1, **options,
        )
        self._pid = os.getpid()
        responses = self._responses
        process = self._process

        def read_responses():
            try:
                for line in process.stdout:
                    responses.put(line, timeout=1)
            except (OSError, ValueError, queue.Full):
                pass
            finally:
                try:
                    responses.put(None, timeout=1)
                except queue.Full:
                    pass

        threading.Thread(target=read_responses, daemon=True).start()

    def apply(self, state, command):
        if not self._lock.acquire(timeout=8):
            raise GameRuntimeError("The game rules service is busy. Please retry.")
        try:
            self._start()
            self._process.stdin.write(json.dumps({"state": state, "command": command}, allow_nan=False) + "\n")
            self._process.stdin.flush()
            line = self._responses.get(timeout=30)
            if line is None:
                raise GameRuntimeError("The game rules service stopped.")
            result = json.loads(line)
            if not result.get("ok"):
                raise ValueError(result.get("message") or "Invalid game action.")
            return result
        except (OSError, queue.Empty, json.JSONDecodeError) as exc:
            self.close()
            raise GameRuntimeError("The game rules service is unavailable. Your previous state is intact.") from exc
        finally:
            self._lock.release()


game_runtime = GameRuntime()
