# Dungeon State Schema

This project uses one canonical runtime state object for generation, rendering,
fog-of-war, interaction, and persistence. The implementation lives in
`S3_content/src/state-schema.js` (`createEmptyDungeonState`); serialization and
hydration normalization live in `S3_content/src/persistence.js`.

> Synced with the code as of the Final Project contract revision (CONTRACTS.md §17).
> If you add a state field, update this file and the `persistence.js` normalizers
> in the same PR.

## Top-Level Shape

```js
{
  seed: number,
  level: number,
  run: RunMeta,
  map: { width: 46, height: 31, tileSize: 52 },
  tiles: Tile[],
  rooms: Room[],
  halls: Hall[],
  entities: Entity[],
  player: PlayerState,
  timers: Timers,
  wanderingMonsters: WanderingMonsters,
  darkness: { pendingDoorKey: string | null },
  lockedDoorAction: { doorId: string, ... } | null,
  visibility: { visibleNow: Set<string>, exploredEver: Set<string> },
  lootLog: { entries: LootEntry[], totalValue: number, fullyLootedShown: boolean },
  characters: Character[],
  activeCharacterId: string | null,
  inventory: Inventory,
  generation: { entranceRoomId: string | null, connectivityValid: boolean }
}
```

## Core Objects

- `Tile`: grid coordinate (`x`,`y`) plus `type` (`wall`,`floor`,`door`,`void`),
  with optional `roomId`, `hallId`, and a `meta` object.
- `Room`: id and rectangular bounds (`x`,`y`,`width`,`height`) plus
  `discovered` and `explored` flags.
- `Hall`: id and linked room ids (`fromRoomId`,`toRoomId`).
- `Entity`: interactive map item:
  - monster (`defeated`)
  - treasure (`value`,`collected`)
  - trap (`revealed`,`triggered`)
  - feature (door/table/etc. — doors carry orientation/hinge/swing/sprite
    fields plus `doorState`: `open`/`closed`/`locked`; see `createDoorEntity`)
- `PlayerState`: tile position (`x`,`y`), `roomId`, `lightSource`
  (`"torch"`, `"lantern"`, or `""` = none), `lightRadius` (≥1, default 6),
  `torchLit` (boolean).
- `LootEntry`: persisted collected treasure (`id`,`name`,`value`,`originTile`).
- `RunMeta`: save bookkeeping — `id` (saved-run id or null), `name`
  (≤15 chars), `dirty`, `lastSavedAt`, `hasUserActivity`.
- `Timers`: `actualElapsedMs`, `torchElapsedMs`, `torchDurationMs`
  (default 1h), `nextWanderingCheckMs` (≥10 min), `lastTickAt`
  (Date.now(); serialized as `null`, reset on hydrate).
- `WanderingMonsters`: encounter odds + history — `numerator` (default 1),
  `denominator` (default 6), `spawnedCount`.
- `Character`: imported/created party member (see `characters.js`
  `normalizeCharacterState`; includes the ShadowDarklings import payload when
  used). `activeCharacterId` points at the controlled character — multiplayer
  dot assignment (CONTRACTS.md §16) references these character ids.
- `Inventory`: gear slots — `baseSlots` (default 10), `bonusSlots`,
  `usedSlots`.

## Visibility Rules

- `visibleNow`: recalculated every move when the player has a lit light source.
- `exploredEver`: monotonic memory set; once tile is seen, it stays explored.
- Visibility uses tile line-of-sight. Wall tiles and closed/locked doors block
  light beyond themselves.
- Fog rendering consumes both sets:
  - not explored -> opaque black
  - explored, not visible -> translucent dark overlay
  - visible -> no fog

## Save/Load Notes

`serializeDungeonState` / `hydrateDungeonState` (persistence.js) normalize on
both directions:

- `visibleNow` / `exploredEver`: `Set` ⇄ `string[]`.
- `timers.lastTickAt` is serialized as `null` and reset to `Date.now()` on load
  (elapsed-time clocks restart; accumulated `*ElapsedMs` values persist).
- `run`, `timers`, `wanderingMonsters`, `inventory`, and `player` light fields
  are defaulted defensively on hydrate so older saves load cleanly (e.g. a
  pre-`lightSource` save hydrates to `lightSource: "torch"` when `torchLit`).
- `lockedDoorAction` survives only if it has a `doorId`; otherwise `null`.
- This serialized object is exactly what `saved_runs.state_json` (CONTRACTS.md
  §1) and `multiplayer_sessions.state_json` (§16.1) store.
