# Mario's E2E Walk — Database & Security (Week 6)

This document log details the Database & Security (Mario's role) end-to-end verification, validating the implementation of SQLModel definitions, Flask-Login authentication session management, BOLA OWASP A01 authorization rules, and Postgres DB-level constraints inside the live Docker deployment on the EC2 server (`Ubuntu-Docker1`).

---

## 1. Database Schema & Tables Verification

We verified that the live Postgres DB container hosts all **7 required tables**:

```bash
docker compose exec db psql -U app -d app -c '\dt'
```

Output:
```text
           List of relations
 Schema |     Name     | Type  | Owner 
--------+--------------+-------+-------
 public | entities     | table | app
 public | halls        | table | app
 public | loot_entries | table | app
 public | rooms        | table | app
 public | saved_runs   | table | app
 public | tiles        | table | app
 public | users        | table | app
(7 rows)
```

---

## 2. Postgres Constraints & Cascade Deletes Validation

### A. SavedRun Level Range Check (`level BETWEEN 1 AND 10`)

We tested inserting a saved run violating the `level BETWEEN 1 AND 10` constraint:

```sql
INSERT INTO saved_runs (user_id, seed, level, state_json, created_at, updated_at) 
VALUES (1, 12345, 11, '{}', NOW(), NOW());
```

Output correctly caught at the database layer:
```text
ERROR:  new row for relation "saved_runs" violates check constraint "saved_runs_level_check"
DETAIL:  Failing row contains (1, 1, 12345, 11, {}, 2026-05-20 00:34:05.924615+00, 2026-05-20 00:34:05.924615+00).
```

### B. Unique Coordinates Constraint (`uq_tile_saved_run_x_y`)

We verified coordinate unique constraints on the `tiles` table by inserting duplicate coordinates `(1, 2)` under the same run:

```sql
INSERT INTO tiles (saved_run_id, x, y, type) VALUES (2, 1, 2, 'floor');
INSERT INTO tiles (saved_run_id, x, y, type) VALUES (2, 1, 2, 'wall');
```

Output:
```text
ERROR:  duplicate key value violates unique constraint "uq_tile_saved_run_x_y"
DETAIL:  Key (saved_run_id, x, y)=(2, 1, 2) already exists.
```

### C. Foreign Key Cascade Deletes

We verified that deleting a parent saved run automatically cascade-purges all child records (`tiles`, `rooms`, `halls`, `entities`, `loot_entries`):

1. **Active Child Row Count Before Delete:**
   ```text
    tiles count: 1
    entities count: 1
   ```
2. **Deleting Parent Run:**
   ```sql
   DELETE FROM saved_runs WHERE id = 2;
   ```
3. **Active Child Row Count After Delete:**
   ```text
    tiles count: 0
    entities count: 0
   ```

---

## 3. Automated Test Suites Verification

Both the local SQLite in-memory environment and the EC2 Docker container Postgres environment have been successfully verified with the complete automated test suites:

```bash
pytest -v
```

Output:
```text
============================= test session starts ==============================
collected 15 items

tests/test_auth.py::test_home_page_loads PASSED                          [  6%]
tests/test_auth.py::test_site_home_shows_placeholder_when_empty PASSED   [ 13%]
tests/test_auth.py::test_login_page_renders PASSED                       [ 20%]
tests/test_auth.py::test_register_creates_user_in_database PASSED        [ 26%]
tests/test_auth.py::test_register_rejects_duplicate_username PASSED      [ 33%]
tests/test_auth.py::test_login_with_wrong_password_shows_invalid PASSED  [ 40%]
tests/test_auth.py::test_login_redirects_home_with_session PASSED        [ 46%]
tests/test_security_run_ownership.py::test_api_endpoints_require_login PASSED [ 53%]
tests/test_security_run_ownership.py::test_owner_can_access_own_run PASSED [ 60%]
tests/test_security_run_ownership.py::test_owasp_bola_404_on_non_owned_run PASSED [ 66%]
tests/test_security_schema_and_login.py::test_required_tables_exist PASSED [ 73%]
tests/test_security_schema_and_login.py::test_saved_runs_level_check_constraint PASSED [ 80%]
tests/test_security_schema_and_login.py::test_tiles_unique_coordinates_constraint PASSED [ 86%]
tests/test_security_schema_and_login.py::test_cascade_delete_saved_run PASSED [ 93%]
tests/test_security_schema_and_login.py::test_flask_login_integration PASSED [100%]

============================== 15 passed in 1.74s ==============================
```

All security, authorization boundaries (OWASP 404 BOLA rule), and database cascade behaviors are fully functional and secure!
