# Dungeon State Schema

This project uses one canonical runtime state object for generation, rendering,
fog-of-war, interaction, and persistence.

## Top-Level Shape

```js
{
  seed: number,
  level: number,
  map: { width: 46, height: 31, tileSize: 52 },
  tiles: Tile[],
  rooms: Room[],
  halls: Hall[],
  entities: Entity[],
  player: PlayerState,
  visibility: { visibleNow: Set<string>, exploredEver: Set<string> },
  lootLog: { entries: LootEntry[], totalValue: number },
  generation: { entranceRoomId: string | null, connectivityValid: boolean }
}
```

## Core Objects

- `Tile`: grid coordinate (`x`,`y`) plus `type` (`wall`,`floor`,`door`,`void`),
  with optional `roomId` and `hallId`.
- `Room`: id and rectangular bounds (`x`,`y`,`width`,`height`) plus
  `discovered` and `explored` flags.
- `Hall`: id and linked room ids (`fromRoomId`,`toRoomId`).
- `Entity`: interactive map item:
  - monster (`defeated`)
  - treasure (`value`,`collected`)
  - trap (`revealed`,`triggered`)
  - feature (door/table/etc.)
- `PlayerState`: tile position (`x`,`y`), `roomId`, `lightRadius`, `torchLit`.
- `LootEntry`: persisted collected treasure (`id`,`name`,`value`,`originTile`).

## Visibility Rules

- `visibleNow`: recalculated every move when torch is lit.
- `exploredEver`: monotonic memory set; once tile is seen, it stays explored.
- Visibility uses tile line-of-sight. Wall tiles and closed/locked doors block
  light beyond themselves.
- Fog rendering consumes both sets:
  - not explored -> opaque black
  - explored, not visible -> translucent dark overlay
  - visible -> no fog

## Save/Load Notes

For JSON serialization, convert sets to arrays on save and restore to sets on
load:

- `visibleNow: string[]`
- `exploredEver: string[]`
