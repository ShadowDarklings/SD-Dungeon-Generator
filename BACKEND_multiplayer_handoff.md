# Backend Handoff: Multiplayer Host Links

## Front-End Status

The static dungeon client now has a front-end multiplayer modal and API wrapper:

- UI entry button: `#multiplayer-btn`
- Modal: `#multiplayer-modal`
- API client: `S3_content/src/multiplayer.js`
- The front end gracefully reports `Multiplayer backend is not connected yet.` when endpoints are missing.

The front end is ready for backend routes that create a host session, join via invite code/link, refresh session presence, and assign a player to a character dot.

## Required API Contract

All endpoints should require login for the first production pass.

### Create Host Session

`POST /api/multiplayer/sessions`

Request body:

```json
{
  "seed": 50631,
  "level": 1,
  "host_character_id": "character-id-or-null",
  "state_json": {
    "full": "serialized dungeon state from frontend"
  }
}
```

Success response:

```json
{
  "id": 1,
  "invite_code": "short-random-code",
  "invite_url": "http://127.0.0.1:5000/site/?session=short-random-code",
  "role": "host",
  "players": [
    {
      "id": "user-id",
      "display_name": "Alice",
      "role": "host",
      "assigned_character_id": "character-id-or-null"
    }
  ],
  "assignments": [],
  "state_json": {}
}
```

### Join Host Session

`POST /api/multiplayer/sessions/<invite_code>/join`

Request body:

```json
{
  "character_id": "optional-current-selected-dot-id",
  "display_name": ""
}
```

Success response should match the create response shape, with `role: "player"`.

### Refresh Session

`GET /api/multiplayer/sessions/<invite_code>`

Success response should match the create response shape.

### Assign Dot

`POST /api/multiplayer/sessions/<invite_code>/assignments`

Request body:

```json
{
  "player_id": "user-id",
  "character_id": "character-id"
}
```

Success response:

```json
{
  "ok": true,
  "players": [],
  "assignments": []
}
```

## Suggested Database Tables

### multiplayer_sessions

- `id`
- `host_user_id`
- `invite_code`
- `seed`
- `level`
- `state_json`
- `created_at`
- `updated_at`
- `closed_at`

### multiplayer_players

- `id`
- `session_id`
- `user_id`
- `display_name`
- `role`: `host` or `player`
- `assigned_character_id`
- `joined_at`
- `last_seen_at`

### multiplayer_events

Use later for real-time sync and audit/debugging.

- `id`
- `session_id`
- `user_id`
- `event_type`
- `payload_json`
- `created_at`

## Important Front-End Assumptions

- Invite links use `/site/?session=<invite_code>`.
- If the page loads with `?session=...`, the modal opens and fills the join input.
- The front end currently treats the backend as authoritative once a session exists.
- `state_json` uses the same serialized format as saved runs via `serializeDungeonState()`.
- The front end expects `players` to include `id`, display name, role/host marker, and optional assigned character ID.
- Assignment UI is host-oriented, but backend must enforce host-only assignment.

## Recommended Backend Milestones

1. Add SQLModel tables and migrations/bootstrap for multiplayer sessions and players.
2. Add create/join/get/assign endpoints matching the response contract above.
3. Require login and current user identity on all endpoints.
4. Enforce host-only assignment.
5. Return `404` for unknown or unauthorized invite codes when appropriate.
6. Add tests for create, join, duplicate join, host assignment, non-host assignment denial, and session ownership.
7. Later: add WebSocket or SSE for live state sync.

