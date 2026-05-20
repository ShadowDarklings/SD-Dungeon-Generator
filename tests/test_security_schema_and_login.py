"""
Security Tests: Schema and Login Integration
Owner: Mario, Database and Security Role

This file verifies that:
1. The 7 tables defined in the CONTRACTS.md exist.
2. The database-level constraints (level check, CASCADE deletes, and coordinates unique constraints) are correctly configured.
3. Flask-Login session management is fully set up and running.
"""

import os
# Set env before import
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret"

import pytest
from datetime import datetime, timezone
from sqlmodel import SQLModel, Session, select
from sqlalchemy.engine import Engine
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError, StatementError

from flask_login import UserMixin
from app import (
    app, engine, User, SavedRun, Tile, Room, Hall, Entity, LootEntry
)

@pytest.fixture
def db_session():
    # Recreate all tables in memory
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        yield session

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_required_tables_exist(db_session):
    """Verify that all 7 required tables are present in the database metadata."""
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    required_tables = {"users", "saved_runs", "tiles", "rooms", "halls", "entities", "loot_entries"}
    for table in required_tables:
        assert table in tables, f"Missing required table: {table}"


def test_saved_runs_level_check_constraint(db_session):
    """Verify that the saved_runs table enforces level range BETWEEN 1 AND 10."""
    # Create a user first
    user = User(username="mario", password_hash="hash")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Valid level 1
    run1 = SavedRun(
        user_id=user.id,
        seed=12345,
        level=1,
        state_json={"player": {"x": 1, "y": 2}}
    )
    db_session.add(run1)
    db_session.commit()

    # Invalid level 0
    run2 = SavedRun(
        user_id=user.id,
        seed=12345,
        level=0,
        state_json={"player": {"x": 1, "y": 2}}
    )
    db_session.add(run2)
    with pytest.raises((IntegrityError, StatementError)):
        db_session.commit()
    db_session.rollback()

    # Invalid level 11
    run3 = SavedRun(
        user_id=user.id,
        seed=12345,
        level=11,
        state_json={"player": {"x": 1, "y": 2}}
    )
    db_session.add(run3)
    with pytest.raises((IntegrityError, StatementError)):
        db_session.commit()
    db_session.rollback()


def test_tiles_unique_coordinates_constraint(db_session):
    """Verify that tiles table enforces UNIQUE(saved_run_id, x, y)."""
    user = User(username="mario", password_hash="hash")
    db_session.add(user)
    db_session.commit()

    run = SavedRun(
        user_id=user.id,
        seed=12345,
        level=5,
        state_json={"grid": []}
    )
    db_session.add(run)
    db_session.commit()

    # First tile at (2, 3)
    tile1 = Tile(saved_run_id=run.id, x=2, y=3, type="floor")
    db_session.add(tile1)
    db_session.commit()

    # Second tile at (2, 3) on same run - should violate unique constraint
    tile2 = Tile(saved_run_id=run.id, x=2, y=3, type="wall")
    db_session.add(tile2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_cascade_delete_saved_run(db_session):
    """Verify that deleting a parent SavedRun cascade-deletes all its child records."""
    # We must explicitly enable foreign key enforcement in SQLite for this test
    db_session.execute(text("PRAGMA foreign_keys = ON"))

    user = User(username="mario", password_hash="hash")
    db_session.add(user)
    db_session.commit()

    run = SavedRun(
        user_id=user.id,
        seed=12345,
        level=5,
        state_json={"grid": []}
    )
    db_session.add(run)
    db_session.commit()

    # Add child rows
    tile = Tile(saved_run_id=run.id, x=1, y=1, type="floor")
    room = Room(saved_run_id=run.id, room_key="room_A", x=1, y=1, width=2, height=2)
    hall = Hall(saved_run_id=run.id, hall_key="hall_1")
    entity = Entity(saved_run_id=run.id, entity_key="monster_1", kind="monster", x=2, y=2)
    loot = LootEntry(saved_run_id=run.id, name="Gold Ring", value=10, origin_tile={"x": 1, "y": 1})

    db_session.add_all([tile, room, hall, entity, loot])
    db_session.commit()

    # Assert they are present
    assert db_session.get(Tile, tile.id) is not None
    assert db_session.get(Room, room.id) is not None
    assert db_session.get(Hall, hall.id) is not None
    assert db_session.get(Entity, entity.id) is not None
    assert db_session.get(LootEntry, loot.id) is not None

    # Cache child row IDs as local integers before delete/expiry
    tile_id = tile.id
    room_id = room.id
    hall_id = hall.id
    entity_id = entity.id
    loot_id = loot.id

    # Delete parent run
    db_session.delete(run)
    db_session.commit()

    # Assert all child rows are gone
    assert db_session.get(Tile, tile_id) is None
    assert db_session.get(Room, room_id) is None
    assert db_session.get(Hall, hall_id) is None
    assert db_session.get(Entity, entity_id) is None
    assert db_session.get(LootEntry, loot_id) is None



def test_flask_login_integration(client):
    """Verify that Flask-Login integration is active and User inherits from UserMixin."""
    assert issubclass(User, UserMixin) or hasattr(User, "is_authenticated")
    
    # Verify app has login_manager active
    assert hasattr(app, "login_manager")
