import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureEquipment, equipItem, hasOccupiedOffHand } from '../../S3_content/src/equipment.js';
import { rollUnarmedAttack, rollDamageExpression } from '../../S3_content/src/damage.js';
import { ensureTimers, syncElapsedTime, hasLiveTimedLight } from '../../S3_content/src/timers.js';
import { hydrateDungeonState, serializeDungeonState } from '../../S3_content/src/persistence.js';
import { normalizeCharacterState } from '../../S3_content/src/characters.js';

function hero() {
  return {id: 'hero', equipmentInitialized: true, gear: [
    {name: 'Bastard sword'}, {name: 'Shield'}, {name: 'Torch', lit: true},
    {name: 'Staff'}, {name: 'Lantern', lit: true}, {name: 'Dagger'}, {name: 'Shield'}
  ]};
}
const held = character => character.gear.flatMap((item, index) => item.equipped ? [index] : []);

test('hand combinations follow the requested replacement priorities', () => {
  const character = hero();
  const equip = index => equipItem(character, index, true);
  equip(0); equip(1); equip(2);
  assert.deepEqual(held(character), [1, 2], 'light replaces weapon when both hands full');
  equip(0);
  assert.deepEqual(held(character), [0, 1], 'weapon replaces light, not shield');
  equip(2); equip(1);
  assert.deepEqual(held(character), [1, 2]);
  equipItem(character, 1, false); equip(0);
  assert.deepEqual(held(character), [0, 2]);
  assert.equal(hasOccupiedOffHand(character), true);
  equip(1);
  assert.deepEqual(held(character), [0, 1], 'shield replaces light');
  equip(6);
  assert.deepEqual(held(character), [0, 6], 'only one shield');
  equip(3);
  assert.deepEqual(held(character), [3], 'two-handed weapon occupies both hands');
  equip(1);
  assert.deepEqual(held(character), [1], 'shield replaces two-handed weapon');
  equip(3); equip(4);
  assert.deepEqual(held(character), [4], 'light replaces two-handed weapon');
  equip(0); equip(5);
  assert.deepEqual(held(character), [4, 5], 'one-handed weapon preserves light');
  equip(2);
  assert.deepEqual(held(character), [2, 5], 'only one light held');
});

test('stowed lights burn without illuminating and survive save/load', () => {
  const character = hero();
  equipItem(character, 2, true);
  assert.equal(character.lightRadius, 6);
  equipItem(character, 3, true);
  assert.equal(character.lightRadius, 0);
  assert.equal(character.gear[2].lit, true);
  const state = {characters: [character], player: {}, timers: {lastTickAt: 1000}};
  syncElapsedTime(state, 2000);
  assert.equal(state.timers.torchElapsedMs, 1000);
  assert.equal(state.timers.lightEverLit, true);
  const loaded = hydrateDungeonState(serializeDungeonState(state));
  normalizeCharacterState(loaded);
  ensureEquipment(loaded.characters[0]);
  assert.equal(loaded.characters[0].lightRadius, 0);
  assert.equal(loaded.characters[0].gear[2].lit, true);
  equipItem(loaded.characters[0], 2, true);
  assert.equal(loaded.characters[0].lightRadius, 6);
});

test('initial map preview light is not a previously lit character torch', () => {
  const state = {characters: [], player: {torchLit: true, lightSource: 'torch'}, timers: {lastTickAt: 1000}};
  assert.equal(ensureTimers(state).lightEverLit, false);
  assert.equal(hasLiveTimedLight(state), false);
  syncElapsedTime(state, 2000);
  assert.equal(state.timers.torchElapsedMs, 0);
});

test('stacked imported torches have independent light and equipment states', () => {
  const character = {gear: [{name: 'Torch', quantity: 3}], lightSource: 'torch', lightRadius: 6};
  ensureEquipment(character);
  assert.equal(character.gear.length, 3);
  assert.deepEqual(character.gear.map(item => !!item.lit), [true, false, false]);
  character.gear[1].lit = true;
  equipItem(character, 1, true);
  assert.deepEqual(held(character), [1]);
  assert.equal(character.gear[0].lit, true);
  ensureEquipment(character);
  assert.equal(character.gear.length, 3);
});

test('legacy equipment migrates once without extinguishing its light', () => {
  const character = {lightSource: 'torch', lightRadius: 6, shieldReadied: true,
    gear: [{name: 'Bastard sword'}, {name: 'Shield'}, {name: 'Torch'}]};
  ensureEquipment(character);
  assert.deepEqual(held(character), [1, 2]);
  equipItem(character, 2, false);
  ensureEquipment(character);
  assert.deepEqual(held(character), [1]);
  assert.equal(character.lightRadius, 0);
  assert.equal(character.gear[2].lit, true);
  const empty = {gear: [{name: 'Backpack'}]};
  ensureEquipment(empty);
  assert.notEqual(empty.gear[0].lit, true);
});

test('all 20 unarmed outcomes use STR to hit and exactly one damage', () => {
  for (let die = 1; die <= 20; die += 1) {
    const attack = rollUnarmedAttack(-2, () => (die - 0.5) / 20);
    assert.equal(attack.name, die <= 10 ? 'Punch' : die <= 18 ? 'Kick' : die === 19 ? 'Headbutt' : 'Body block');
    assert.equal(attack.bonus, -2);
    assert.equal(rollDamageExpression(attack.damageExpression).total, 1);
  }
});
