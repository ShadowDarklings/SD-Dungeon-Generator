"""Account-wide storage bounds include history and recoverable deleted data."""
from sqlalchemy import String, cast, func
from sqlmodel import select
from room_models import GameRoom, SaveCheckpoint

MAX_ACCOUNT_BYTES = 64 * 1024 * 1024
STORAGE_FULL = ({"error": "storage_limit", "message": "Account storage is full, including retained save history and recently deleted games."}, 409)


def storage_available(db, user_id, SavedRun, SavedCharacter):
    db.flush()
    total = 0
    sources = (
        (SavedRun.state_json, SavedRun.user_id == user_id),
        (SavedCharacter.character_json, SavedCharacter.user_id == user_id),
        (GameRoom.state_json, GameRoom.host_user_id == user_id),
        (SaveCheckpoint.state_json, SaveCheckpoint.saved_run_id.in_(select(SavedRun.id).where(SavedRun.user_id == user_id))),
    )
    for column, predicate in sources:
        total += db.exec(select(func.coalesce(func.sum(func.length(cast(column, String))), 0)).where(predicate)).one()
    return total <= MAX_ACCOUNT_BYTES
