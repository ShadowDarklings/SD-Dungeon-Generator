"""Durable room identity, membership, invitation and command records."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlmodel import SQLModel, Field


def utcnow():
    return datetime.now(timezone.utc)


class GameRoom(SQLModel, table=True):
    __tablename__ = "game_rooms"
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True, max_length=32)
    host_user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(default="Unnamed dungeon", max_length=80)
    state_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    ownership_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    saved_roster_json: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    revision: int = Field(default=1, nullable=False)
    autonomous_exploration: bool = Field(default=False, nullable=False)
    extra_characters_without_host: bool = Field(default=False, nullable=False)
    bury_others: bool = Field(default=False, nullable=False)
    joins_locked: bool = Field(default=False, nullable=False)
    saved_run_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="SET NULL"), nullable=True, index=True))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    simulated_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    closed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class RoomMember(SQLModel, table=True):
    __tablename__ = "room_members"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_room_account"),
        UniqueConstraint("room_id", "guest_hash", name="uq_room_guest"),
    )
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True, max_length=32)
    room_id: str = Field(sa_column=Column(String(32), ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True))
    user_id: int | None = Field(default=None, sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True))
    guest_hash: str | None = Field(default=None, max_length=64)
    display_name: str = Field(default="Player", max_length=80)
    role: str = Field(default="player", max_length=10)
    status: str = Field(default="active", max_length=10)
    joined_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    last_seen_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))


class RoomInvite(SQLModel, table=True):
    __tablename__ = "room_invites"
    code_digest: str = Field(primary_key=True, max_length=64)
    room_id: str = Field(sa_column=Column(String(32), ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True))
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))


class RoomCommand(SQLModel, table=True):
    __tablename__ = "room_commands"
    __table_args__ = (UniqueConstraint("room_id", "member_id", "request_id", name="uq_room_command_request"),)
    id: int | None = Field(default=None, primary_key=True)
    room_id: str = Field(sa_column=Column(String(32), ForeignKey("game_rooms.id", ondelete="CASCADE"), nullable=False, index=True))
    member_id: str = Field(sa_column=Column(String(32), ForeignKey("room_members.id", ondelete="CASCADE"), nullable=False))
    request_id: str = Field(max_length=64)
    revision: int = Field(nullable=False)
    message: str = Field(default="", max_length=2000)
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))


class SaveCheckpoint(SQLModel, table=True):
    __tablename__ = "save_checkpoints"
    id: int | None = Field(default=None, primary_key=True)
    saved_run_id: int = Field(sa_column=Column(Integer, ForeignKey("saved_runs.id", ondelete="CASCADE"), nullable=False, index=True))
    revision: int = Field(nullable=False)
    state_json: dict = Field(sa_column=Column(JSON, nullable=False))
    roster_json: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    ownership_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
class RecoveryCode(SQLModel, table=True):
    __tablename__ = "recovery_codes"
    digest: str = Field(primary_key=True, max_length=64)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True))
    created_at: datetime = Field(default_factory=utcnow, sa_column=Column(DateTime(timezone=True), nullable=False))
    used_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
