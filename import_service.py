"""Private browser-import service. It receives no account or database secrets."""
import json
import threading

from flask import Flask, request

from shadowdarklings_import import MAX_IMPORT_BYTES, run_shadowdarklings_import_worker


app = Flask(__name__)
_import_slot = threading.BoundedSemaphore(1)


@app.get("/healthz")
def health():
    return {"status": "ok"}, 200


@app.post("/import")
def import_character():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or type(data.get("base_classes_only", False)) is not bool:
        return {"error": "invalid_request", "message": "Invalid character import request."}, 400
    if not _import_slot.acquire(blocking=False):
        return {
            "error": "import_busy",
            "message": "Another character import is already running. Please try again in a moment.",
        }, 503, {"Retry-After": "5"}
    try:
        character_json = run_shadowdarklings_import_worker(data.get("base_classes_only", False))
        if len(character_json.encode("utf-8")) > MAX_IMPORT_BYTES or not isinstance(json.loads(character_json), dict):
            raise ValueError("Invalid character export")
        return {"character_json": character_json}, 200
    except Exception as exc:
        app.logger.warning("Isolated ShadowDarklings import failed (%s): %s", type(exc).__name__, exc)
        return {
            "error": "upstream_unavailable",
            "message": "ShadowDarklings is currently unreachable or timed out.",
        }, 503
    finally:
        _import_slot.release()
