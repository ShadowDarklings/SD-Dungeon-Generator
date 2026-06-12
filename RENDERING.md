# Map Rendering Pipeline

Reference for how the SD Dungeon Generator draws the dungeon map. Primary implementation lives in `S3_content/src/render.js`.

## Canvas dimensions

| Constant | Value | Source |
|----------|-------|--------|
| Map size | 46 × 31 tiles | `constants.js` |
| Tile size | 54 × 54 px | `constants.js` |
| Canvas size | 2484 × 1674 px | 46×54 by 31×54 |

## DOM layer stack (bottom → top)

Four `<canvas>` elements are created once per dungeon in `setupCanvasLayers()` (`main.js`) and appended to `#map-host` in this order:

1. `layer-background`
2. `layer-topology`
3. `layer-objects`
4. `layer-fog`

CSS (`styles.css`) positions each with `position: absolute; left: 0; top: 0`. Background, topology, and fog have `pointer-events: none`. The objects layer receives click events for tile interaction.

The entire `#map-host` is scaled and panned via CSS `transform: translate(...) scale(...)` for zoom/pan.

## Frame entry point

```
main.js render()
  └─ renderDungeon(state, layers, options)   // render.js
       options.forceBlackout = torch out + blackout toggle enabled
       options.now = performance.now()       // reserved for future animation
```

Visibility is **not** computed during draw. It is updated beforehand by `recomputeVisibility()` in `visibility.js` (on movement, door changes, torch toggle, timer expiry).

---

## Pre-render: visibility / line of sight

**File:** `S3_content/src/visibility.js`  
**Function:** `recomputeVisibility(state)`

1. Clear `state.visibility.visibleNow`.
2. If torch is out (`!state.player.torchLit`), stop — no tiles are visible this frame.
3. For each map tile within Chebyshev distance `state.player.lightRadius` (default 6) of the player:
   - Run `hasLineOfSight(state, tile.x, tile.y)`:
     - Bresenham ray from player to target tile.
     - Block on `WALL` and `VOID` tiles.
     - Block on closed/locked doors (`isAcrossClosedDoor` + per-step `getDoorBetween`).
   - If visible: add tile key to `visibleNow` and `exploredEver`; mark rooms discovered/explored.

**State used by fog:**

| Set | Meaning |
|-----|---------|
| `visibleNow` | Lit this frame (torch on + in radius + LOS) |
| `exploredEver` | Permanently remembered tiles |

---

## Draw order inside `renderDungeon()`

### Step 1 — Background layer: stone texture

**Function:** `drawHandDrawnBackground()` (or flat `drawBackground()` fallback)

**Asset:** `./assets/map_background_dark.jpg`

- Tiled across the full canvas (2484 × 1674) via `drawTiledImage()`.
- Repeats at the image's native width/height.
- Drawn under everything, including walls and fog.

### Step 2 — Topology layer: clear

`topologyCtx.clearRect(0, 0, widthPx, heightPx)`

### Step 3 — Topology layer: floor grid

**Function:** `drawHandDrawnTopology()` — first pass

**Asset:** `./assets/room_grid_backgroung.jpg` *(note: filename typo "backgroung")*

- For each tile where `type === FLOOR`:
  - Sample source region at `(dx % floorImage.width, dy % floorImage.height)`.
  - Draw 54 × 54 px at tile position `(tile.x * 54, tile.y * 54)`.
- All floor tiles are drawn every frame; fog does not clip this layer.

### Step 4 — Topology layer: wall strips

**Function:** `drawHandDrawnTopology()` — second pass

**Assets:**

| Orientation | File |
|-------------|------|
| North | `./assets/54x810-1x15-n.png` |
| West | `./assets/54x810-1x15-w.png` |
| East | `./assets/54x810-1x15-e.png` |
| South | `./assets/54x810-1x15-s.png` |

**Placement logic:**

1. `collectWallRuns(state)` — for each room side (N/S/E/W), find contiguous wall segments between openings (doors or hall connections).
2. `collectHallWallRuns(state)` — hall perimeter edges merged into runs.
3. `chooseWallImage(state, run)` — pick N/W/E/S strip and slice offset from seed hash.
4. `drawWallSlice(ctx, image, state, run)` — extract a horizontal slice from the 810 px long axis (up to 15 tiles × 54 px) and draw along the wall run; rotate for vertical walls.

Strip dimensions: **54 × 810 px** (1 tile wide × 15 tiles long).

### Step 5 — Objects layer: clear

`objectsCtx.clearRect(0, 0, widthPx, heightPx)`

### Step 6 — Objects layer: doors

**Function:** `drawObjects()` → `drawEntity()` → `drawDoorSprite()`

**Assets:** `./assets/door{1-4}.png`, `door{1-4}-o.png` (open), `door{1-4}-l.png` (locked), `door{1-4}-t.png` (trapped)

- Doors are entities with `subtype === "door"`.
- Centered on wall boundary via `getDoorBoundaryCenter()`.
- Rotated via `getDoorRotationAngle()`.
- Drawn at 54 × 54 px.
- Falls back to geometric `drawDoorFallback()` if sprite missing.

### Step 7 — Objects layer: entities

**Function:** `drawObjects()` → `drawEntity()`

Colored circles (radius ≈ 54 × 0.24):

| Entity type | Color |
|-------------|-------|
| Monster | `#be2d2d` |
| Treasure | `#e0bc2f` |
| Trap | `#a22dcf` |
| Default (features) | `#4db1a7` |

`drawObjects()` skips: hidden entities, defeated monsters, collected treasure. In blackout mode, unrevealed `FEATURE` entities are also hidden (doors always draw).

### Step 8 — Objects layer: player

**Function:** `drawPlayer()`

- Blue circle `#3a7bd5`, white stroke, radius ≈ 54 × 0.27.
- Centered on player tile.
- Drawn last on the objects layer so it appears above entities.

### Step 9 — Fog layer: clear

`fogCtx.clearRect(0, 0, widthPx, heightPx)`

### Step 10–11 — Fog layer: explored and unexplored shadow

**Function:** `drawFog()`

Per-tile `fillRect` at 54 × 54. **No canvas masks** — no `clip()`, `globalCompositeOperation`, or CSS masks.

**Normal mode (torch lit):**

| Tile state | Fog |
|------------|-----|
| In `visibleNow` | No fog (skip tile) |
| In `exploredEver`, not visible | `rgba(0, 0, 0, 0.45)` — explored shadow |
| Never explored | `rgba(0, 0, 0, 0.95)` — unexplored shadow |

**Blackout mode** (`forceBlackout === true`, torch out + toggle enabled):

| Tile state | Fog |
|------------|-----|
| In `exploredEver` | `rgba(0, 0, 0, 0.82)` |
| Never explored | `rgba(0, 0, 0, 1.0)` |

Ignores `visibleNow` entirely.

---

## Why `map_background_dark` is rarely visible

Stone is drawn on the bottom layer, then floor tiles cover walkable areas, then fog overlays everything:

- Unexplored tiles: 95% black — stone shows at ~5% opacity.
- Explored-but-not-lit tiles: 45% black — floor and stone both dimmed.

To expose stone in wall/void areas, fog opacity would need to vary by tile type (see planned work in viewport/rendering plan).

---

## Asset preload

**Function:** `preloadRendererAssets()` in `render.js`

Loads at app startup via `initialize()` in `main.js`. Door sprites load optionally (missing files warn to console, fallback drawing used).

---

## Fallback renderer

When `USE_HAND_DRAWN_RENDERER` is false or assets are not ready:

- **Background:** gray checkerboard (`drawBackground()`).
- **Topology:** gray floor rects + black stroke grid + dark wall fills (`drawTopology()`).
- Objects and fog behave the same.

---

## Key files

| File | Role |
|------|------|
| `S3_content/src/render.js` | All canvas draw calls, asset paths, fog |
| `S3_content/src/main.js` | Layer setup, render loop, viewport transform, blackout flag |
| `S3_content/src/visibility.js` | LOS computation, `visibleNow` / `exploredEver` |
| `S3_content/src/constants.js` | `TILE_SIZE_PX`, map dimensions, entity types |
| `S3_content/styles.css` | Layer positioning, map panel sizing |
| `docs/STATE_SCHEMA.md` | Visibility state schema |

---

## Pipeline diagram

```
recomputeVisibility()          [visibility.js — before draw]
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│ 1. background   map_background_dark.jpg (tiled)         │
├─────────────────────────────────────────────────────────┤
│ 2. topology     room_grid_backgroung.jpg (per floor tile)│
│ 3. topology     54x810 wall strips (N/W/E/S)            │
├─────────────────────────────────────────────────────────┤
│ 4. objects      door PNG sprites                        │
│ 5. objects      entity colored dots                     │
│ 6. objects      player blue dot                         │
├─────────────────────────────────────────────────────────┤
│ 7. fog          explored shadow (0.45 alpha)            │
│ 8. fog          unexplored shadow (0.95 alpha)          │
└─────────────────────────────────────────────────────────┘
```
