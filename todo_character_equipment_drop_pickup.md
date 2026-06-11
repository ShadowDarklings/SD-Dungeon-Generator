# Character Equipment Drop / Pickup TODO

## Goal

Build character-owned equipment as a real dungeon interaction system:

- Gear can be dropped from a character sheet into the dungeon.
- Dropped gear can be picked up by whichever selected character has room and is allowed to use/carry it.
- Weapons, armor, shields, ammo, light sources, and misc gear update the character sheet honestly after each change.
- The first imported character is guaranteed a starting light source without silently losing equipment.

This should be implemented as a coordinated subsystem, not as one-off UI buttons, because the current app stores imported `attacks` and `armorClass` directly on the character rather than deriving them from gear after inventory changes.

## Current Code Touchpoints

- `S3_content/src/characters.js`
  - Normalizes imported character gear, attacks, AC, ammo, and gear slots.
  - `getSlotsFromGear()` and `getCharacterGearFreeSlots()` already calculate carry usage.
- `S3_content/src/main.js`
  - `createSdGearPanel()` renders Gear but does not map displayed slot lines back to source items.
  - Attack buttons currently come from `character.attacks`.
  - Map click handler selects dots first, then calls `clickEntity()`.
- `S3_content/src/interactions.js`
  - Room loot already uses `ENTITY_TYPES.TREASURE`.
  - `dropLootAtPlayer()` already creates a visible dropped-loot treasure entity.
- `S3_content/src/render.js`
  - Visible treasure entities already render as yellow dots.

## Phase 1: Equipment Data Helpers

- Add a shared equipment module, probably `S3_content/src/equipment.js`.
- Normalize gear items into stable records:
  - `id`
  - `name`
  - `kind`: `weapon`, `armor`, `shield`, `ammo`, `light`, `tool`, `misc`
  - `slots`
  - `quantity` or `totalUnits`
  - `damage`
  - `attackBonus`
  - `armorClass`
  - `equipped`
  - `sourceItem`
- Add helpers:
  - `cloneGearItem(item)`
  - `getGearItemSlots(item)`
  - `getGearItemUnits(item)`
  - `getCharacterFreeGearSlots(character)`
  - `canCharacterCarryItem(character, item)`
  - `addGearItem(character, item)`
  - `removeGearItem(character, itemId)`
  - `dropGearItem(state, character, itemId, options)`
  - `pickupDroppedGear(state, character, entityId)`
- Keep multi-slot items as one source item, but render all occupied slot lines.
- When a multi-slot item is removed, all slot lines for that item must disappear together.

## Phase 2: First Import Light Source Guarantee

Respect the previous lantern rule:

- If the first imported character already has a torch, light that torch.
- If the first imported character has a lantern and oil but no torch, light the lantern instead of adding a torch.
- If the first imported character has no torch and no lantern+oil, add 1 torch.
- If there is a free gear slot, add the torch to the highest free gear slot.
- If there is no free gear slot:
  - Remove the last complete gear item from the character, including every slot line occupied by that item.
  - Add 1 torch to the highest free gear slot.
  - Spawn the removed item as lootable dropped equipment adjacent to the first character dot.
- Dropped item placement:
  - Random adjacent visible room/hall tile.
  - Must not be occupied by a character, monster, door, trap, treasure, or other dropped equipment.
  - If no adjacent tile is valid, search outward in rings until a valid visible floor tile is found.

## Phase 3: Dropped Equipment Entity

Represent dropped gear with a visible map entity:

```js
{
  id: "gear-drop-...",
  type: ENTITY_TYPES.TREASURE,
  subtype: "dropped-equipment",
  kind: "weapon" | "armor" | "shield" | "ammo" | "light" | "tool" | "misc",
  name: "Shortsword",
  x,
  y,
  roomId,
  visible: true,
  value: 0,
  slots: 1,
  gearItem: { ...originalGearItem },
  collected: false
}
```

Pickup behavior:

- Clicking dropped equipment attempts pickup by the currently selected character.
- If no character is selected, print: `Select a character to pick up equipment.`
- If selected character lacks enough free gear slots, print: `[name] has no room for [item].`
- If selected character is not allowed to use/carry/equip the item, print a clear class restriction message.
- If pickup succeeds:
  - Add item to first available gear slot.
  - Remove dropped entity from map.
  - Recalculate attacks, ammo gates, AC, and light controls.
  - Print: `[name] picks up [item].`

## Phase 4: Gear Panel Drop UI

- Update `getCharacterGearSlots()` so each displayed line knows which source gear item created it.
- In `createSdGearPanel()`:
  - Each real gear item line should be clickable.
  - Clicking a line reveals a small `Drop` button for that item.
  - Clicking another gear line moves the drop button.
  - Placeholder continuation lines for multi-slot items should either:
    - Select the same source item, or
    - Be non-clickable but visually tied to the source item.
- Drop behavior:
  - Remove the whole gear item from the character.
  - Spawn dropped equipment adjacent to the selected character.
  - Recalculate attacks, ammo gates, AC, and light controls.
  - If dropping a lit torch, lit lantern, or magic light, use the existing light-drop rules instead of generic equipment rules.

## Phase 5: Class Equipment Restrictions

Class names should be case-insensitive and normalized before checking.

### Fighter

- May use all weapons.
- May use all armor.
- May use shields.

### Priest

- May use all armor.
- May use shields.
- User-provided weapon restriction: priest cannot attack with:
  - Club
  - Crossbow
  - Dagger
  - Mace
  - Longsword
  - Staff
  - Warhammer

Note: this list blocks most common priest weapons. Confirm before enforcing if it looks inverted during implementation.

### Thief

- Armor allowed:
  - Leather
  - Mithral chainmail
- Weapons allowed:
  - Club
  - Crossbow
  - Shortsword
  - Dagger
  - Shortbow

### Wizard

- Cannot wear armor.
- Weapons allowed:
  - Dagger
  - Staff

## Phase 6: Attack Recalculation

After any gear mutation:

- Rebuild character attacks from legal equipped/carried weapons.
- Remove attacks for dropped weapons.
- Add attacks for picked-up legal weapons.
- Respect ammo gates:
  - Shortbow requires `arrows >= 1`.
  - Longbow requires `arrows >= 1`.
  - Crossbow requires `crossbow bolts >= 1`.
- If arrows or bolts reach `0`, hide the matching ranged weapon attack.
- Preserve non-weapon special attacks only if they are not tied to removed gear.
- Backstab buttons should continue to be generated from thief-legal weapon attacks, not from standalone `Backstab` rows.

## Phase 7: AC Recalculation

After any gear mutation:

- Rebuild AC from legal armor and shield gear.
- Remove AC contribution for dropped armor/shields.
- Add AC contribution for picked-up legal armor/shields.
- Wizard armor is ignored or rejected.
- Thief armor is ignored/rejected unless leather or mithral chainmail.
- Priest and fighter armor/shields apply normally.
- Decide whether illegal pickup is blocked entirely or allowed as carried-but-not-equipped.
  - Safer initial rule: block illegal armor/weapon pickup with a clear message.

## Phase 8: Save / Load Migration

- Persist dropped equipment entities in save data.
- Preserve `gearItem` data on dropped entities.
- Normalize older dropped equipment entities on load.
- Ensure loaded characters recalculate:
  - gear slots
  - ammo
  - attacks
  - AC
  - active light source

## Phase 9: Tests

Add or extend tests for:

- First character with torch lights torch.
- First character with lantern+oil lights lantern and does not get a free torch.
- First character with no light source and free slot receives a torch.
- First character with no light source and full gear drops last complete item and receives a torch.
- Dropped equipment can be picked up by selected character with free slots.
- Dropped equipment cannot be picked up with no free slots.
- Dropping weapon removes the attack.
- Picking up legal weapon adds the attack.
- Bow/crossbow attacks disappear without ammo.
- Dropping armor/shield updates AC.
- Wizard cannot wear armor.
- Thief can only wear leather or mithral chainmail.
- Thief weapon restrictions.
- Fighter all-equipment permissive behavior.
- Priest restrictions, after confirming the user-provided weapon list.

## Implementation Notes

- Do not mutate imported `raw` character data as the source of truth for active gameplay.
- Prefer recalculating display fields from normalized gear, then writing the derived result to `character.attacks` and `character.armorClass` for compatibility with existing UI.
- Keep all gear mutations followed by:
  - `normalizeCharacterState(state)`
  - light sync/update helpers
  - `render()`
  - `updatePanels()`
  - `saveCurrentState()`
- Avoid partial implementation where dropped gear changes the visible Gear list but leaves old attacks/AC intact.

