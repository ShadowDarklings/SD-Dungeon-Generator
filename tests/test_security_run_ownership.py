"""
Security Tests: Authorization & Run Ownership (OWASP BOLA / A01)
Owner: Mario, Database and Security Role

This file verifies that:
1. Endpoints protecting saved runs (GET/POST/PUT/DELETE /api/runs) require login.
2. Ownership checks are strictly enforced.
3. Accessing other users' runs returns a 404 Not Found (OWASP BOLA 404-for-not-yours rule)
   rather than 403 Forbidden to prevent enumeration of other users' runs.
"""

import os
# Set env before import
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret"

import pytest
from sqlmodel import SQLModel, Session
from app import (
    app, engine, User, SavedRun
)

@pytest.fixture
def client_and_users():
    app.config["TESTING"] = True
    
    # Recreate in-memory tables
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    
    # Insert two test users into the database
    with Session(engine) as db:
        user_a = User(username="alice", password_hash="pbkdf2:sha256:...")
        user_b = User(username="bob", password_hash="pbkdf2:sha256:...")
        db.add_all([user_a, user_b])
        db.commit()
        db.refresh(user_a)
        db.refresh(user_b)
        
        # Insert a run for alice
        run_a = SavedRun(
            user_id=user_a.id,
            seed=4242,
            level=3,
            state_json={"character": {"x": 1, "y": 1}}
        )
        db.add(run_a)
        db.commit()
        db.refresh(run_a)
        
        # Keep track of IDs for tests
        user_a_id = user_a.id
        user_b_id = user_b.id
        run_a_id = run_a.id
        
    with app.test_client() as client:
        yield client, user_a_id, user_b_id, run_a_id


def test_api_endpoints_require_login(client_and_users):
    """Verify that secure endpoints block anonymous users and require login."""
    client, _, _, run_id = client_and_users
    
    # GET /runs should redirect to login or return 401
    res = client.get("/runs")
    assert res.status_code in (302, 401)
    
    # GET /api/runs
    res = client.get("/api/runs")
    assert res.status_code == 401
    
    # POST /api/runs
    res = client.post("/api/runs", json={"seed": 1, "level": 1, "state_json": {}})
    assert res.status_code == 401
    
    # GET /api/runs/<id>
    res = client.get(f"/api/runs/{run_id}")
    assert res.status_code == 401
    
    # PUT /api/runs/<id>
    res = client.put(f"/api/runs/{run_id}", json={"state_json": {}})
    assert res.status_code == 401
    
    # DELETE /api/runs/<id>
    res = client.delete(f"/api/runs/{run_id}")
    assert res.status_code == 401


def test_owner_can_access_own_run(client_and_users):
    """Verify that a logged-in user can access and manage their own run."""
    client, user_a_id, _, run_id = client_and_users
    
    # Log in as Alice (user_a)
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_a_id)  # Flask-Login storage convention
        
    # GET own run should succeed
    res = client.get(f"/api/runs/{run_id}")
    assert res.status_code == 200
    
    # PUT own run should succeed
    res = client.put(f"/api/runs/{run_id}", json={
        "seed": 4242,
        "level": 3,
        "state_json": {"character": {"x": 2, "y": 2}}
    })
    assert res.status_code == 200
    
    # DELETE own run should succeed
    res = client.delete(f"/api/runs/{run_id}")
    assert res.status_code == 204


def test_owasp_bola_404_on_non_owned_run(client_and_users):
    """Verify that accessing another user's run returns 404, not 403, to mitigate enumeration."""
    client, _, user_b_id, run_id_a = client_and_users
    
    # Log in as Bob (user_b)
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_b_id)
        
    # GET Alice's run as Bob -> expect 404
    res = client.get(f"/api/runs/{run_id_a}")
    assert res.status_code == 404
    
    # PUT Alice's run as Bob -> expect 404
    res = client.put(f"/api/runs/{run_id_a}", json={
        "state_json": {"character": {"x": 5, "y": 5}}
    })
    assert res.status_code == 404
    
    # DELETE Alice's run as Bob -> expect 404
    res = client.delete(f"/api/runs/{run_id_a}")
    assert res.status_code == 404
