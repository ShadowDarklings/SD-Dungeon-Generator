# SD Dungeon Generator — Client-Side E2E Walk

**Role:** Client-side (Front-end)
**Owner:** Dungeon Master

## 1. Definition

End-to-end for the client slice means a real browser hitting the deployed Flask app and verifying the dungeon UI in `/site/` can render, save, and load runs via the contracted API. This walk covers UI structure, modal flows, and the user-visible states that unit tests cannot prove.

## 2. The walk

### Setup

**Step 1.** Start the deployed app and open `http://localhost:5000/site/` in a browser.

### Client UI flow

**Step 2.** Generate a dungeon with a real seed and level.

**Step 3.** Open the Save modal and confirm the empty state when no runs exist.

**Step 4.** Save a run with a short name. Confirm the modal shows a success state.

**Step 5.** Reopen the modal and load the saved run. Confirm the dungeon state updates.

**Step 6.** Trigger a failure path (log out, then open Save/Load). Confirm the error message is visible.

## 3. Pass criteria

- **Step 1:** `/site/` loads and renders the map container and control panel without browser errors.
- **Step 2:** A dungeon renders and the status line updates after generation.
- **Step 3:** The modal shows a clear empty state and a visible saved-runs list container.
- **Step 4:** The modal reports a success state and the run appears in the list.
- **Step 5:** Loading a run replaces the current state (seed/level or layout visibly changes).
- **Step 6:** Save/Load shows a login-required error instead of silently failing.

## 4. Execution log

| Step | Result | Notes |
|------|--------|-------|
| 1 | PASS | `/site/` loaded successfully. |
| 2 | PASS | Dungeon rendered after Generate. |
| 3 | FAIL | Save modal still shows "Server returned a non-JSON response." after login. |
| 4 | BLOCKED | Save cannot proceed because `/api/runs` does not return JSON. |
| 5 | BLOCKED | Load cannot proceed because saved runs never load. |
| 6 | NOT RUN | |

## 5. Findings

### Finding 1 — Save modal error instead of empty state

**Symptom**: Opening Save shows "Server returned a non-JSON response." and no empty-state message.

**Root cause**: `/api/runs` returns HTML or a redirect instead of JSON, even after login.

**Fix**: Server-side `/api/runs` must return JSON (200 with `{ results: [...] }`) for authenticated users.

**Lesson**: Client UI depends on the API returning JSON per contract; without it, Save/Load flows fail even when logged in.
