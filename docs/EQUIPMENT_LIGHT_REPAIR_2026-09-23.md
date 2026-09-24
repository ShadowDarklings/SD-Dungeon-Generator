# Equipment, lighting, and unarmed combat

- Hand equipment is explicit and saved. Equipping a two-handed weapon clears
  other hand items; weapon/shield/light conflicts follow the owner's rulings.
  Versatile weapons use 1d8 with a shield or light and 1d10 with the other hand free.
- Burning and equipped are independent for carried lights. Imported light stacks
  become individual items; stowed lights keep burning but do not illuminate.
  The existing shared party timer remains in use.
- The dungeon remembers whether an actual light has ever been lit, excluding
  the empty-map preview light. The first available imported light is automatic;
  later imports can light from nearby light. Existing darkness checks remain.
- Gear-row Light acts on the selected item, refreshes the sheet, and displays its
  confirmation above the sheet. Light spells illuminate their caster.
- All imports spawn inside the entrance room, sharing a safe tile if the full
  sixteen-character party exceeds its free tiles.
- Starting-room purchases use personal coins, then Party Assets, without changing XP.
  Multiplayer equipment/purchase commands enforce existing character ownership.
- Characters with no equipped weapon use STR to hit and deal exactly 1 damage.
  A separate d20 selects Punch (1-10), Kick (11-18), Headbutt (19), or Body block
  (20). Spell-check dice can no longer become fallback weapon damage.

Local verification: 13 JavaScript tests; 109 Python tests passed, with 21 existing
environment-dependent skips. The new browser audit exercises torchless and lit
imports, independent torches, gear checkboxes, AC/damage updates, local unarmed
combat, and desktop/mobile control hit testing with no page errors. Performance
audit: 30/30 arrow moves; median 7.95 ms, p95 10.7 ms game-processing time. The
performance audit uses a fixture importer; it is not an upstream import benchmark.

Run `npm test`, `.venv/Scripts/python.exe -m pytest -q`, and
`.venv/Scripts/python.exe scripts/check_equipment_browser.py` to repeat these checks.
