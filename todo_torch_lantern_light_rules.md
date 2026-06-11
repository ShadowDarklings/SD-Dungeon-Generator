# Torch / Lantern Light Rules TODO

Goal: replace the current mostly-global torch behavior with per-character and dropped-light-source rules.

## Torch Rules

- Show "Light New Torch" only when the selected dot:
  - Has a torch and flint and steel, or
  - Is standing inside an existing light radius.
- First imported character:
  - If they have a torch, mark the lowest torch as `(lit)`.
  - If they do not have a torch but have an empty gear slot, add a torch to the first free gear slot and mark it `(lit)`.
  - First dot begins shedding torch light under current radius rules.
- Second and later imported characters:
  - Do not shed light by default.
  - Must be selected and use "Light New Torch" to start shedding light.
- When lighting inside an existing light radius:
  - Add bold orange `(lit)` next to the lowest torch in GEAR.
  - Start a timer for that specific torch.
  - Selected dot sheds light in a 6-square radius.
- When a lit torch timer ends or "Torch went out!" is clicked while that dot is selected:
  - Delete that lit torch from GEAR.
  - Leave the gear slot open.
  - Dot immediately stops shedding that torch light.
- When lighting in darkness:
  - Check selected dot class and DEX modifier.
  - Thief rolls `1d20 + DEX mod` against DC 12.
  - Success: "Torch lit!", mark torch `(lit)`, start timer, dot sheds light.
  - Failure: "you fail to light the torch and destroy it.", delete bottom torch from selected dot's GEAR.

## Lantern Rules

- Lantern is a gear item.
- Lanterns shed light in a 12-square radius.
- Lanterns require oil.
- Oil uses the same timer duration as a torch.
- Use `(burning)` instead of `(lit)`.
- Add "Light Lantern" button when selected dot:
  - Has a lantern,
  - Has oil,
  - And either is inside a light radius or has flint and steel.
- Lighting a lantern in darkness:
  - Check DEX mod, DC 12.
  - Success: "Lantern is lit!"
  - Failure: "you spill the oil!", delete bottom oil from inventory.

## Dropped Light Sources

- Show "Drop Torch" when selected dot has a lit torch.
- Show "Drop Lantern" when selected dot has a lit lantern.
- Show "Drop Light" when selected dot has an active Light spell.
- Dropping a torch:
  - Delete lit torch from inventory.
  - Place a small red dot with a yellow X on a random adjacent visible, unoccupied room/hall tile.
  - Character stops shedding that light.
  - Dropped torch continues shedding light on its existing timer.
- Dropping a lantern:
  - Delete lantern and lit oil from inventory.
  - Place a small gray dot with a yellow X on a random adjacent visible, unoccupied room/hall tile.
  - Character stops shedding that light.
  - Dropped lantern continues shedding light on its existing timer.
- If a monster is within 6 tiles when a torch or lantern is dropped:
  - 50% chance dropped light goes out immediately.
  - Torch message: "Torch sputters out!"
  - Lantern message: "Lantern tips and spills."
- Dropping magic light:
  - Place a small yellow dot with a light blue X on a random adjacent visible, unoccupied room/hall tile.
  - Character stops shedding the Light spell.
  - Stationary magic light continues until the 1-hour spell timer ends, the caster casts Light again, or the caster reaches 0 or less HP.

## Pickup Rules

- Unlit lanterns are small gray dots without a yellow X.
- Lanterns can be picked up by clicking them if selected dot has enough free GEAR slots.
- Lit lantern pickup requires two slots: lantern plus oil `(lit)`/`(burning)`.
- Remove the lantern map marker and stationary light source when picked up.
- If picked-up lantern is lit, the holding dot sheds lantern light.
- If lantern went out, it can be picked up and later relit using Light Lantern rules.
- Torches that go out due to monster checks or timers are deleted from the dungeon.

## Data Model Work

- Add per-character active light source state.
- Add per-gear-item lit/burning metadata.
- Add per-light timer records, not one global torch timer.
- Add stationary light source entities for dropped torches and lanterns.
- Add stationary light source entities for dropped Light spells.
- Recompute visibility from all active character-carried and stationary light sources.
- Preserve save/load compatibility with old runs.

## UI Work

- Render lit/burning notes in the character sheet GEAR list.
- Add Light New Torch, Light Lantern, Drop Torch, and Drop Lantern visibility rules.
- Route torch/lantern messages through Status and/or Dice Roller consistently.
- Add small map markers for dropped torches and lanterns.

## Testing

- Import first character with torch.
- Import first character without torch but with empty gear slot.
- Import second character with torch and confirm no default light.
- Light torch inside another light radius.
- Attempt torch lighting in darkness as thief and non-thief.
- Timer expiration removes only the relevant lit torch/oil.
- Drop light source adjacent to selected dot.
- Monster extinguish 50% check.
- Pick up lit/unlit lantern with enough and not enough gear slots.
