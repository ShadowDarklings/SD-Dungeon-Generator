"""Bounded retention cleanup. Run daily with the web application's database role."""
import os
from pathlib import Path
import sys
from datetime import timedelta

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["SD_SKIP_DB_BOOTSTRAP"] = "1"
from app import engine, SavedRun, SavedCharacter
from room_models import GameRoom, RoomInvite, RoomCommand, utcnow
from sqlmodel import Session, select, delete

with Session(engine) as db:
    now = utcnow()
    db.exec(delete(RoomInvite).where(RoomInvite.expires_at < now))
    db.exec(delete(RoomCommand).where(RoomCommand.created_at < now - timedelta(days=1)))
    for model in (SavedRun, SavedCharacter):
        db.exec(delete(model).where(model.deleted_at < now - timedelta(days=30)))
    db.exec(delete(GameRoom).where(GameRoom.saved_run_id == None, GameRoom.updated_at < now - timedelta(days=30)))
    db.commit()
print("Retention cleanup completed.")
