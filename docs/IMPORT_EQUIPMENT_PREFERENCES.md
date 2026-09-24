# Imported character equipment

New imports select a legal two-hand loadout before lighting a held torch or
lantern. Saved characters with initialized equipment keep their saved choices.

- Actual light reaching any floor tile in the entrance room determines whether
  it is illuminated. Preview light, incoming-character light, and viewer-specific
  fog of war do not count. Walls block light.
- In darkness, a usable lantern (with oil) or torch wins over every weapon,
  including a fighter's mastered two-handed weapon. Lanterns win over torches.
  A light plus shield can intentionally leave the character unarmed.
- Fighter mastery is the next preference. In an illuminated room, the preferred
  two-handed weapon or bow wins over a shield and backup light.
- Otherwise shields precede ordinary one-handed weapons. Equal STR and DEX use
  the DEX order: ranged, then finesse melee. Higher STR prefers the STR weapon
  with the highest maximum damage. Lower-ranked backup lights and weapon
  categories follow the owner's import preference list.
- Class-restricted items and ranged weapons without ammunition are not selected.
  At most one weapon, shield, and light can be selected, within two total hands.
- Weapons, shields, torches, and lanterns use the same Gear-row Equip checkbox.
  Unequipped attacks remain visible but disabled. Fighter weapon talents display
  the weapon name followed by "mastery".

Regression coverage includes pure ranking tests, authoritative room imports,
saved-loadout preservation, line-of-sight boundaries, mastery spelling variants,
and desktop/mobile character-sheet controls. Run `npm test`, `python -m pytest
-q`, and `python scripts/check_equipment_browser.py` from the project environment.
