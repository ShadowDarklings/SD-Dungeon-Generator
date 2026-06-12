# Dungeon Generator / Watabou-Inspired Rewrite TODO

Reference target: https://watabou.github.io/one-page-dungeon/?seed=1616564000

Goal: improve our dungeon shapes and wall rendering while preserving our current Shadowdark site priorities: grid-aligned N/S movement, fog/shadow exploration, character dots, import, dice roller, torch rules, doors, traps, treasure, and room interaction.

## Current Implementation Status

- First-pass rect graph generator is implemented in `S3_content/src/generator.js`.
- `generateDungeon` now uses room rectangles connected by short hall/threshold runs, with doors occupying hall tiles outside the room instead of being placed inside room floors.
- The first room is labeled `1`, receives an entrance stair tile, and the player spawn starts inside that first room near the stair.
- Existing room content population is still called after geometry generation, so room traps, door traps, monsters, and treasure continue to be placed by the existing ShadowSpawner logic.
- `state.decor.columns` and `state.decor.water` are now generated for renderer-side visual decor.
- `generateClassicDungeon` keeps the previous placeholder generator available for debugging/comparison.
- Seed sweep note: 500 generated seeds passed connectivity validation with a minimum of 9 rooms after the recovery growth pass.
- Current direction: do not import Watabou data into the app. Use Watabou exports only as design inspiration while building our own procedural generator.
- First-pass architectural room roles are implemented in `S3_content/src/generator.js`:
  - `entrance`
  - `junction`
  - `guardRoom`
  - `vault`
  - `shrine`
  - `waterRoom`
  - `rotunda`
  - `ending`
  - `deadEndFeature`
  - `chamber`
- `state.generation.architecture.pattern` now records the high-level layout pattern:
  - `processional`
  - `cross`
  - `hub`
  - `symmetricWings`
  - `chain`
- Room roles now influence monster, treasure, trap, door trap, feature, columns, water, locked doors, secret doors, and gate chances.

## Future Lighting / Shadow Rewrite

The current visibility system is tile-first: it decides whether each whole tile is visible, then the renderer paints whole-tile fog. That is simple and stable for movement, but it cannot fully express Watabou-style geometry. The desired next lighting model should be shape-first:

- Keep tile visibility for movement, search, room discovery, and game rules.
- Add a separate render-only light mask computed from geometry polygons.
- Treat walls, closed doors, pillars, rotunda outer arcs, and perhaps large decor as occluder segments.
- Cast rays from every active light source to every occluder vertex, with small angle offsets, then build a visible-light polygon.
- Render fog by clipping/subtracting that light polygon rather than filling whole tiles.
- Doors should create a bisecting shadow line through their hallway tile while still allowing the near half of the door art to show.
- Pillars should cast small shadows behind them and should be able to partially shade their own tile.
- Rotundas should use circular/arc occluders or enough short line segments to follow the curve instead of approximating the room as square tile corners.
- Water and other floor decor should not block light unless explicitly marked as an occluder.
- This should be render-only at first; do not change movement collision or tile-level gameplay rules until the visual model is proven.

Implementation strategy:

- Introduce a `buildLightOccluders(state)` helper that emits line segments in pixel coordinates.
- Convert tile walls to boundary segments, not filled squares, so diagonal light can graze corners.
- Add explicit occluders for `state.decor.columns`, `room.rotunda`, and closed door entities.
- Add `buildLightPolygon(lightSource, occluders, radiusPx)` using angular ray casting.
- Draw explored/unexplored darkness as today, then cut or composite visible-light polygons over it.
- Keep the current tile visibility code as the gameplay truth while comparing visual light against it during development.

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

## Findings From Watabou Inspection

- The public page embeds a compiled OpenFL/Lime app through `Dungeon.js`; the HTML does not contain a tile map or simple DOM renderer.
- The app exposes compiled Haxe class names such as:
  - `com.watabou.dungeon.model.Dungeon`
  - `com.watabou.dungeon.model.Room`
  - `com.watabou.dungeon.model.Door`
  - `com.watabou.dungeon.visuals.RoomView`
  - `com.watabou.dungeon.visuals.DoorView`
- The renderer is primarily vector/procedural:
  - `RoomView` draws polygons, grid lines, cracks, circular grids for round rooms, and colonnades.
  - `DoorView` draws door/stair details with primitive graphics calls.
  - Wall appearance is driven by stroke widths, wall polygons, shadows, seams, and hatching areas.
- The app supports export modes including PNG, SVG, JSON, VOX, and Markdown, but the default page does not expose raw JSON without interacting with the compiled app.
- Useful concepts to adapt rather than copy:
  - Room/hall shapes as polygons rather than only bitmap wall strips.
  - Thick ink perimeter strokes.
  - Hatching areas outside drawable wall polygons.
  - Door/stair symbols drawn procedurally in a single tile.
  - Room metadata/notes generated separately from geometry.

## Findings From Exported JSON Samples

Two pasted exports, `Shattered Asylum of the Black King` and `Lost Crypt of Peri-Aride`, confirm that Watabou's interesting layouts are still fundamentally grid-based.

### Export Shape

Top-level fields observed:

- `version`
- `title`
- `story`
- `rects`
- `doors`
- `notes`
- `columns`
- `water`

### Rects

- `rects` are not only large rooms. They include:
  - Large rooms/chambers.
  - Thin hall/corridor segments.
  - 1x1 threshold/door/stair cells.
  - Special room flags such as `ending: true` and `rotunda: true`.
- Coordinates may be negative. A local importer/prototype should normalize all exported coordinates by shifting the minimum `x` and `y` to positive map space.
- A strong pattern is: large room rectangle, then explicit 1x1 connector rectangles between rooms.
- The first export is mostly a long ordered chain of rooms. The second export branches heavily around a central trunk and includes a `rotunda`.
- Important design translation for our generator:
  - Treat each rect as a floor primitive.
  - Classify large rects as rooms.
  - Classify skinny rects and 1x1 rects as corridors, thresholds, stairs, or door cells.
  - Preserve a graph relationship between connected rects so room discovery and notes remain possible.

### Doors

- Doors use:
  - `x`, `y`
  - `dir: { x, y }`
  - `type`
- Door coordinates usually match 1x1 connector rects.
- Door direction points toward the next cell/room relationship.
- From the compiled renderer inspection:
  - Types `3`, `8`, and `9` are rendered as stair/exit-like symbols.
  - Type `5` appears to be a special gate/major door.
  - Type `0`, `1`, and `2` are ordinary/special door variants.
- Practical translation:
  - Store every door as an entity on its own threshold tile.
  - Add `doorKind` or `watabouDoorType` metadata.
  - Map type `3` to entrance stairs.
  - Map type `8` to exit stairs or stairs down.
  - Map type `9` to internal stairs/level transition.
  - Keep type `5` available for gate/locked special door behavior.

### Notes

- Notes have:
  - `text`
  - `ref`
  - `pos`
- Notes are tied to map positions, not directly to room IDs in the export.
- Translation strategy:
  - Assign each note to the containing room rect if `pos` falls inside a large room.
  - If a note falls on a corridor/threshold, assign it to nearest room or keep it as a feature entity.
  - Use placeholder text in our generator now, but preserve the data shape so authored tables can replace it later.

### Columns / Pillars

- Columns are simple tile coordinate lists.
- The renderer draws them as crosshatched wall-like interior features.
- Translation strategy:
  - Add `state.decor.columns = [{ x, y }]` or feature entities with subtype `column`.
  - Render as small black/crosshatched blocks inside visible rooms.
  - Treat as blocked movement only if we explicitly want tactical obstacles. Initial recommendation: visual-only until movement rules are decided.

### Water

- Water is also a simple tile coordinate list.
- It can occupy room/corridor tiles and stair-adjacent regions.
- Translation strategy:
  - Add `state.decor.water = [{ x, y }]` or tile flag `terrain: "water"`.
  - Render as blue/ink wash beneath fog.
  - Initial movement rule: passable unless later toggled into difficult terrain.

### Rotundas

- A rotunda is represented as a normal rect with `rotunda: true`.
- Translation strategy:
  - Keep the same rectangular tile footprint for movement.
  - Render the floor and wall as an oval/circle clipped inside that rect.
  - Visibility can continue using the rectangular footprint for the first prototype.

### Generator Lessons

- Watabou does not rely on our current "scatter rooms, then connect centers with L halls" pattern.
- It appears to grow rooms from door/axis origins, producing strings, branches, symmetry, and occasional compact/no-corridor layouts.
- For our grid movement, the best adaptation is a rect-graph generator:
  - Start with an entrance threshold and a seed room.
  - Maintain a queue of open exits.
  - Grow the dungeon by attaching a new rect at a chosen exit.
  - Sometimes attach side rooms, branches, symmetric pairs, or 1x1 connector cells.
  - Reject overlaps with padding.
  - Add loop connections after the main graph is built.
  - Normalize coordinates into our map bounds.
  - Convert large rects to `state.rooms`, connector rects to hall tiles or door threshold entities.

## Prototype Implemented

- Added a first-pass Watabou-inspired canvas overlay in `S3_content/src/render.js`.
- It reuses our existing wall-run collection and does not change dungeon data, movement, fog, doors, dots, traps, treasure, or import behavior.
- The overlay draws:
  - Crosshatching outside room and hall wall edges.
  - Thick black ink lines along room and hall perimeters.
- This is intentionally a visual prototype over the existing hand-drawn renderer, not a generator replacement.

## Charles-Rendered Asset Catalog

New assets were created in `S3_content/assets` and copied into the active worktree.

### Doors

- New files begin with `door-`.
- Door assets are `54x54`.
- Doors now occupy one hall/threshold tile outside the room.
- Default orientation: opens into a room from the north or south side.
- Suffixes:
  - `door-closed.png`
  - `door-gone.png`
  - `door-open.png`
  - `door-secret.png`
  - `door-trap.png`
  - `door-portcullis.png`
- Compatibility note:
  - Original file was rendered as `door-portculis.png`.
  - The active worktree includes both spellings; code should prefer `door-portcullis.png`.

### Water

- Water assets are `54x54`.
- `water-c.png` is a central water tile.
- `water-nw-[n].png` is a diagonal piece.
  - Supported corners: `nw`, `ne`, `se`, `sw`.
  - Source orientation has a black line from NE corner to SW corner.
  - Transparent blue water texture is southeast of that black line.
  - The northwest corner, west side, and north side are transparent.
  - Rotate the source asset for other diagonal corners.
- `water-nn-[n].png` is a flat run piece.
  - Supported edges: `n`, `e`, `s`, `w`.
  - Source orientation has a horizontal black line.
  - Area below the line is transparent blue.
  - Rotate the source asset for other edge directions.

### Stairs

- Stair assets are `54x54`.
- Down stairs:
  - Files: `d-stair-[n].png`.
  - Highest step faces north in the source art.
  - Rotate as needed for other directions.
- Up stairs:
  - Files: `u-stair-n.png`, `u-stair-e.png`, `u-stair-s.png`, `u-stair-w.png`.
  - Suffix indicates the highest stair direction.

### Pillars

- Pillar assets are `54x54`.
- `plr-[n].png` is a round-pillar set.
- `plr-b-[n].png` is a second pillar style.
- Use a consistent style family per column group/room when possible.
- Default orientation faces north.
- Hatching/shadow assumes light/shadow direction consistent with other dungeon shadows; each pillar casts shadow to the southeast.

### Rotunda

- `rotunda7x7.png` is `486x486`, equivalent to `9x9` tiles at `54px` per tile.
- It contains a transparent black line enclosing a `7x7` room.
- It has one opening on the south side.
- Border treatment:
  - One tile width of crosshatch texture border.
  - One additional tile of transparent border.
- No floor was rendered yet.
- Renderer should draw normal floor first, then place the rotunda overlay from one tile northwest of the `7x7` room footprint.

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

## Renderer PNG Wishlist

Priority 1: high-impact modular renderer pieces:

- Rounded wall/corner overlays for rectangular rooms.
  - `wall-round-corner-nw/ne/se/sw`
  - Transparent outside the curved wall.
  - Designed to sit over a normal square room corner and visually soften it without changing movement.
- Doorway shadow masks / threshold overlays.
  - Half-tile shadow pieces for north/east/south/west door approaches.
  - Useful while we bridge from tile fog to polygon lighting.
- More rotunda sizes.
  - `rotunda5x5`, `rotunda7x7`, `rotunda9x9`.
  - Ideally each has openings for `n/e/s/w`, or a neutral asset that rotates cleanly.
- Shrine/statue/focal-point tiles.
  - 1x1 statue.
  - 2x2 altar/shrine floor feature.
  - Broken statue/rubble variant.
- Pillar shadow variants.
  - Single pillar.
  - Broken pillar.
  - Paired pillar arch impression.
  - Transparent background, shadow cast SE by default like current pillars.
- Irregular hallway edge overlays.
  - Cracked wall bite.
  - Collapsed wall.
  - Eroded/cave-like wall edge.
  - Mortared-to-rough transition.
  - These can overlay normal hall tiles so movement stays grid-clean.
- Water edge expansion.
  - Concave diagonal corners.
  - Convex diagonal corners.
  - Thin trickle/stream pieces.
  - Small puddle pieces that do not need to tile perfectly.
  - Dark shoreline-only overlays separate from blue fill would be especially flexible.

Priority 2: room-role flavor pieces:

- Vault door / barred vault gate.
- Shrine floor sigil.
- Guard-room barricade or weapon rack.
- Treasure plinth / chest dais.
- Rear-exit stair variants.
- Broken raised-floor edge or platform lip.
- Room number / note marker glyphs that match the hand-drawn map style.

Priority 3: future lighting helpers:

- Soft round light edge texture.
- Pillar cast-shadow texture.
- Door crack/sliver-of-light texture.
- Rotunda curved shadow masks.
- Hatch/fill brushes that can be stamped procedurally.

## Recommended Next Implementation Steps

### Step 1: Architectural Generator Tuning

Use our own rect-graph generator and tune it toward intentional built spaces.

Focus:

- Add room roles.
- Add high-level layout patterns.
- Let roles influence doors, decor, monsters, traps, treasure, and features.
- Compare many seeds visually and tune probabilities.
- Do not import Watabou data.

### Step 2: Add Visual Feature Rendering

Add renderer support for:

- `state.decor.columns`
- `state.decor.water`
- `room.rotunda`
- `doorKind: "stairs-up" | "stairs-down" | "gate" | "door"`

Keep these visual-only first.

### Step 3: Rect-Graph Generator Prototype

After the importer proves the render model, build our own generator inspired by the export structure.

Feature flag:

- `GENERATOR_MODE = "classic" | "rectGraph"`

Rect-graph algorithm:

- Start with entrance threshold and first room.
- Keep a queue of exits.
- For each exit, choose one:
  - Extend corridor.
  - Add room.
  - Add branch pair.
  - Add stair/transition.
  - Add dead-end note/feature.
- Reject overlaps.
- Track a graph of room-to-room connections.
- Add loops after primary growth.
- Populate with our existing traps, treasure, monsters, doors, and visibility rules.

### Step 4: Room Description UX

- Store `room.description`.
- Show it once when selected character enters that room.
- Use placeholder text until authored tables exist.
- Keep notes/features clickable in the side panel as a fallback.
