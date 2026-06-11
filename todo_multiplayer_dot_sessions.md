# Multiplayer Dot Sessions TODO

Goal: allow multiple users on multiple devices to log into the same dungeon session, with each player controlling one character dot while a host manages the session.

## Product Flow

- Add a "Multiplayer" or "Invite Players" button.
- Open a modal with host/player options.
- Host can create a dungeon session and generate an invite link/code.
- Joining players can either:
  - Import a character and spawn next to the host.
  - Be assigned an existing dot by the host.
- Host can assign, reassign, or remove dot control.
- Each player controls only their assigned dot by default.
- Host can optionally override or move any dot.

## Session Model

- Add a shared dungeon session ID.
- Persist dungeon state on the server, not only in local browser state.
- Track users, display names, assigned character IDs, host status, and connection status.
- Track per-dot position, HP, gear edits, light sources, torch timers, explored tiles, revealed traps, doors, treasure, monsters, and dice events.
- Decide whether fog/exploration is shared globally or player-specific. Initial recommendation: shared globally for simplicity.

## Real-Time Sync

- Use WebSockets or Server-Sent Events plus POST actions.
- Broadcast authoritative state updates from the server.
- Use client-side optimistic movement only if rollback is handled cleanly.
- Add conflict rules:
  - One controller per dot.
  - Host wins administrative conflicts.
  - Server validates movement and interactions.
- Sync dice roller output to all players, with player name/dot name attribution.

## Host Controls

- Invite link/code.
- Assign dot to player.
- Spawn joined player next to host.
- Kick/remove player.
- Transfer host role.
- Lock/unlock imports.
- Toggle whether players can move while host is in a modal or paused state.

## Authentication

- Reuse existing login/register/save-load foundation.
- Support guest join as a later option if desired.
- Require stable user IDs for saved multiplayer campaigns.
- Avoid storing OAuth secrets or production credentials in client code.

## Technical Milestones

- Define server-side session schema.
- Add API endpoints for create/join/leave session.
- Add WebSocket/SSE event channel.
- Convert local state mutations into action messages.
- Add server-side action validation.
- Add multiplayer modal UI.
- Add player presence UI.
- Add host assignment UI.
- Add tests for movement permissions and session joining.
- Add reconnect/resume behavior.

## Open Questions

- Should non-host players see the full character sheets of other players?
- Should inventory edits be host-only, player-owned, or shared?
- Should fog be shared globally or per-player?
- Should the host be able to pause all movement?
- Should players be allowed to import after the session starts, or only when host approves?
