# Security Handoff: Multiplayer Host Links

## Scope

The front end now exposes a multiplayer invite modal and calls new backend endpoints under:

- `POST /api/multiplayer/sessions`
- `POST /api/multiplayer/sessions/<invite_code>/join`
- `GET /api/multiplayer/sessions/<invite_code>`
- `POST /api/multiplayer/sessions/<invite_code>/assignments`

Security review should focus on invite-code access, session ownership, dot-control authorization, and state mutation validation.

## Required Security Rules

### Authentication

- Require login for all multiplayer endpoints in the first production pass.
- Do not allow anonymous joins until guest identity and abuse controls are explicitly designed.
- Continue returning JSON `401` for unauthenticated API access.

### Invite Code Safety

- Generate invite codes server-side with cryptographically secure randomness.
- Codes should be high entropy, URL-safe, and not sequential.
- Store only the active invite code; consider supporting rotation later.
- Do not expose internal database IDs as invite codes.
- Avoid leaking whether a private session exists to unauthorized users beyond the intended join flow.

### Authorization

- Host can:
  - Create session.
  - View session.
  - Assign/reassign dots.
  - Eventually kick players, transfer host, lock imports, and override movement.
- Player can:
  - Join session by valid invite code.
  - View session after joining.
  - Control only their assigned character.
- Non-host players must not assign dots.
- Users outside a session must not fetch full session state.

### State Mutation

- Backend should become authoritative once multiplayer is active.
- Never trust client-submitted character IDs without verifying:
  - Character exists in that session state.
  - User is assigned to that character, or user is host.
  - Action is legal for that character.
- Movement, interaction, HP, gear, light, loot, trap, door, and monster mutations should become validated action endpoints or event messages.
- Avoid accepting full arbitrary `state_json` updates from non-host users.

### CSRF / Same-Origin

- Existing save/load APIs use same-origin credentials and CSRF exemptions for JSON endpoints.
- Security should decide whether multiplayer JSON endpoints should:
  - Remain CSRF-exempt but require same-origin/session auth plus strict content type, or
  - Use CSRF tokens for mutating requests.
- Do not allow cross-origin credentialed writes.

### Privacy

- Session responses should expose only needed player display fields:
  - user/session player ID
  - display name
  - role
  - assigned character ID
- Do not expose email, OAuth provider IDs, password hash fields, or unrelated saved runs.

### Abuse Controls

- Rate-limit create-session and join attempts.
- Rate-limit invalid invite-code guesses.
- Consider max active sessions per user.
- Consider max players per session.
- Add expiration/close behavior for stale sessions.

## Front-End Behavior To Preserve

- The front end opens the modal automatically for `/site/?session=<invite_code>`.
- The join input accepts either a raw code or a full invite link.
- Missing backend currently shows `Multiplayer backend is not connected yet.`
- The assignment controls are visible in the front end, but backend must still enforce host-only assignment.

## Security Test Checklist

- Unauthenticated create/join/get/assign returns `401`.
- Unknown invite code returns safe JSON error.
- Non-member cannot fetch session state.
- Joined player can fetch only joined session.
- Non-host cannot assign/reassign dots.
- Host can assign dots.
- Player cannot control unassigned dots once action endpoints exist.
- Invite codes are non-sequential and not guessable.
- Session responses exclude sensitive user fields.
- Invalid JSON and wrong content type are handled safely.

