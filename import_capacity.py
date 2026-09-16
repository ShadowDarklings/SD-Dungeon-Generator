"""Bound expensive browser imports across workers; fail closed on limiter outages."""
from contextlib import contextmanager
import os
import threading

_local_slot = threading.BoundedSemaphore(1)


@contextmanager
def import_slot():
    storage = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    if storage.startswith(("redis://", "rediss://")):
        from redis import Redis
        client = Redis.from_url(storage, socket_timeout=3, socket_connect_timeout=3)
        lock = client.lock("sd:browser-import", timeout=180, blocking_timeout=0)
        if not lock.acquire(blocking=False):
            raise RuntimeError("The import service is busy.")
        try:
            yield
        finally:
            try:
                lock.release()
            finally:
                client.close()
    else:
        if not _local_slot.acquire(blocking=False):
            raise RuntimeError("The import service is busy.")
        try:
            yield
        finally:
            _local_slot.release()
