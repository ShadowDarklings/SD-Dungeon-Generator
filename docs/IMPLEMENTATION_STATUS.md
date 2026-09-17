# Security and Host-Owned Dungeon Sessions

## Accepted Behavior

- Six-character password minimum; long passwords remain supported.
- Host owns the dungeon and its named saves. Joined accounts can reopen a host's named saved game; joining does not grant invitation or host privileges.
- Four-character alphanumeric invitations. Guests can join and, when the host allows it, import characters; accounts are required to save/load personal characters.
- Host options: autonomous exploration while absent (default no); player import/load (default no); more than one player-controlled character (default no and unavailable when player import/load is off); burial of dead characters belonging to other players (default no).
- Without autonomous exploration and without the host, players can import/load when allowed, save their own characters, and view sheets, but cannot move or perform gameplay/sheet edits.
- Players and host control/edit only their own characters. Host can bury dead characters; players can bury their own dead characters and others only when allowed.
- The host can assign any dungeon character to any participant. Assignment transfers control exclusively; host-managed players receive at most one character and unassigned characters remain under host control.
- Maximum 16 characters, including dead characters until buried. New players have no token until they import/load an allowed character or the host assigns one.
- Everyone sees token movements, character information, and combat actions. A player without a character can pan and zoom, use the manual dice roller, and open read-only sheets, but cannot perform character or dungeon actions.
- Character order is local. Latest imported/loaded character is shown first; drag reorders only that browser's list, without changing combat order.

## Work

- [x] Review existing accounts, saves, multiplayer, movement, combat, import and sheet code.
- [x] Reuse existing JavaScript game rules in a bounded server-side runtime.
- [x] Add guest identities, host-owned rooms, expiring invites, ownership, presence, revisions, commands, named saves and roster snapshots.
- [x] Wire browser actions, options, guest import, return/load flow, read-only views and local reordering.
- [x] Complete account/CSRF/cookie/limiter/validation/save-recovery hardening.
- [x] Add production configuration, migration and backup/restore support and deployment checks.
- [x] Verify with backend tests, runtime tests and two-browser desktop/mobile workflows; start a local preview.

## Implementation Decisions

- Keep Flask and PostgreSQL. A Node process executes the existing game rules from the same JavaScript source used by solo play; no browser or client-supplied code is executed on the server.
- Use jsdom only for the trusted local document bindings needed by the existing module. No scripts or remote resources are enabled in jsdom.
- The game runtime accepts allowlisted commands, never arbitrary code or player-submitted full game state. Flask checks membership, ownership, host absence settings and revisions before invoking it.
- Final two-browser desktop/mobile check passes guest joining, host assignment and transfer, no-character read-only/map/dice access, guest import, own-token movement, read-only other sheets, host reload, desktop drag and mobile touch ordering, host absence, permission switches, guest-to-account ownership, personal character saving, and return through the host's saved name. Screenshots and canvas pixel checks were inspected; no horizontal viewport overflow was found.
- Python suite: 72 passed, 21 skipped, one upstream Flask-Login deprecation warning. The skipped checks require the nginx/HTTPS deployment or its logs. JavaScript suite: 3 passed.
- Replaced vulnerable dependency pins. Final pip-audit and npm audit both reported no known vulnerabilities.
- One real Shadowdarklings import succeeded through the isolated browser worker in about three seconds. The repeatable two-browser suite stubs that upstream request, but uses the real room APIs and game runtime.
- PostgreSQL CI, container/TLS, production Chromium, OAuth and backup/restore checks remain governed by the release gate in `MULTIPLAYER_DEPLOYMENT.md`.
