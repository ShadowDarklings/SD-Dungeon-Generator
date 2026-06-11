# Dungeon Generator / Watabou-Inspired Rewrite TODO

Reference target: https://watabou.github.io/one-page-dungeon/?seed=1616564000

Goal: improve our dungeon shapes and wall rendering while preserving our current Shadowdark site priorities: grid-aligned N/S movement, fog/shadow exploration, character dots, import, dice roller, torch rules, doors, traps, treasure, and room interaction.

## Research

- Inspect the target seed and several additional Watabou One Page Dungeon seeds.
- Determine whether the renderer uses SVG, canvas drawing primitives, generated HTML, PNG tiles, or a mixed approach.
- Identify how room outlines are built: thick wall strokes, crosshatching on the outside of walls, and how wall direction is chosen.
- Identify how doors are placed. Current observation to verify: doors appear to occupy a hall tile rather than a room tile or room/hall border tile.
- Identify how round rooms are represented in data and rendered visually.
- Identify how stairs are spawned and rendered. Current observation: stairs are roughly triangular line clusters occupying one tile.
- Identify how pillars are spawned and rendered. Current observation: pillars are regularly placed crosshatched wall-like structures inside rooms.
- Inspect how water, raised room sections, entrance stairs, and exit stairs are represented.
- Inspect whether room descriptions are selected from tables, generated grammatically, or attached by room type.

## Shape Strategy

- Keep our movement grid orthogonal and tile-based.
- Replace or augment our room/hall generator with larger shape primitives:
  - Rectangular rooms.
  - Rounded/oval rooms approximated on the tile grid.
  - Irregular joined-room clusters.
  - Wider halls with occasional bends and alcoves.
  - Door tiles placed as explicit hall/threshold entities.
- Preserve a generated topology graph so exploration, visibility, doors, traps, treasure, and room ownership still work.
- Spawn the first character near an entrance/exit stair tile.
- Ensure generated paths remain fully traversable before placing content.

## Rendering Strategy

- Keep our existing canvas/layer render architecture unless a prototype proves a better option.
- Add wall-edge metadata per tile or per room perimeter:
  - Solid thick wall stroke on the room-facing edge.
  - Crosshatching on the non-room side of the wall.
  - Door breaks that consume a hall/threshold tile.
- Prototype walls using canvas strokes first.
- Ask Charles for PNG resources only after the procedural stroke prototype proves what assets are needed.
- Potential art resources to request:
  - Hatch pattern tile or brush.
  - Stair glyph.
  - Pillar/crosshatched block.
  - Water fill texture.
  - Raised floor hatch or contour texture.
  - Door glyph variants.

## Room Descriptions

- Add room-description metadata to rooms.
- Trigger a room-description pop-up when the selected dot enters a room for the first time.
- Use placeholder text initially: "Random description here."
- Later, replace placeholders with Charles-authored tables:
  - Room purpose.
  - Mood/sensory detail.
  - Strange feature.
  - Clue/foreshadowing.
  - Hazard hint.

## Preservation Requirements

- Do not remove or weaken fog/shadow exploration.
- Do not break character dot movement or autonomous dot positions.
- Do not break Shadowdarklings import.
- Do not break Dice Roller, damage links, search, traps, doors, treasure, or torch visibility.
- Do not rotate the whole map; selected dots must continue to move intuitively with arrow keys.

## Prototype Milestones

- Create a standalone generator prototype behind a feature flag.
- Render only floors, walls, doors, stairs, and pillars first.
- Add visibility/fog integration.
- Add treasure, traps, monsters, and room descriptions.
- Add entrance-aware first-dot spawn.
- Compare 20 generated seeds against the current generator before replacing default generation.
