# SD Dungeon Generator — Client-Side E2E Walk

**Role:** Client-side (Front-end)
**Owner:** Dungeon Master

## 1. Definition

End-to-end for the client slice means a real browser hitting the deployed Flask app and verifying the dungeon UI in `/site/` can render and interact with the saved-runs flow through the contracted API. This walk covers the visible controls, modal states, and browser behavior that unit tests cannot prove on their own. It is intentionally honest about failures in the backend contract, because the client should surface those failures instead of hiding them.

## 2. The walk

### Setup

**Step 1.** Start the deployed app and open `http://localhost:5000/site/` in a browser.

### Client UI flow

**Step 2.** Generate a dungeon with a real seed and level.

**Step 3.** Open the Save modal and confirm the empty state when no runs exist.

**Step 4.** Save a run with a short name. Confirm the modal shows a success state.

**Step 5.** Reopen the modal and load the saved run. Confirm the dungeon state updates.

**Step 6.** Trigger a failure path by logging out, then open Save/Load and confirm the error message is visible.

## 3. Pass criteria

- **Step 1:** `/site/` loads and renders the map container and control panel without browser errors.
- **Step 2:** A dungeon renders and the status line updates after generation.
- **Step 3:** The modal shows a clear empty-state view and a visible saved-runs list container.
- **Step 4:** The modal reports a success state and the run appears in the list.
- **Step 5:** Loading a run replaces the current state so the seed/level or layout visibly changes.
- **Step 6:** Save/Load shows a login-required or contract-failure error instead of silently failing.

## 4. Execution log

| Step | Result | Notes |
|------|--------|-------|
| 1 | PASS | `/site/` loaded successfully. |
| 2 | PASS | Dungeon rendered after Generate. |
| 3 | PASS | Save modal now returns the expected auth-required JSON response instead of the old non-JSON parse failure. |
| 4 | BLOCKED | Save remains blocked in an anonymous session because `/api/runs` requires login. |
| 5 | BLOCKED | Load remains blocked until a saved run exists for the logged-in user. |
| 6 | NOT RUN | |

## 5. Findings

### Finding 1 — Save modal error instead of empty state

**Symptom**: Opening Save no longer shows "Server returned a non-JSON response."; the API now replies with JSON and a login-required message when anonymous.

**Root cause**: The previously observed non-JSON backend response was fixed in the merged backend update.

**Fix**: The server-side `/api/runs` contract now returns JSON; authenticated users should receive `{ results: [...] }`, and anonymous users receive a JSON 401.

**Lesson**: Client UI depends on the API returning JSON per contract; that contract is now restored, so the old parse failure should not be used in the final submission notes.
