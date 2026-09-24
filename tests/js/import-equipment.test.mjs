import test from 'node:test';
import assert from 'node:assert/strict';
import { equipImportLoadout, isTwoHandedWeapon } from '../../S3_content/src/equipment.js';
import { getMaximumDamage } from '../../S3_content/src/damage.js';

function choose({ dark = false, str = 10, dex = 10, mastery = '', shield = true, oil = true, names } = {}) {
  const profiles = {
    Longbow: { ability: 'DEX', ranged: true, maxDamage: 8 },
    Shortbow: { ability: 'DEX', ranged: true, maxDamage: 4 },
    Dagger: { ability: 'DEX', ranged: false, maxDamage: 4 },
    Greatsword: { ability: 'STR', ranged: false, maxDamage: 12 },
    Mace: { ability: 'STR', ranged: false, maxDamage: 6 },
    Spear: { ability: 'STR', ranged: true, maxDamage: 6 },
  };
  const character = { stats: { STR: str, DEX: dex }, gear: names.map(name => ({ name })) };
  const weapons = names.flatMap((name, index) => profiles[name] ? [{ index, ...profiles[name], mastered: name === mastery }] : []);
  equipImportLoadout(character, { needsLight: dark, weapons, shieldAllowed: shield, lanternFueled: oil });
  return character.gear.filter(item => item.equipped).map(item => item.name);
}

test('darkness prefers fueled lantern, then shield, over non-mastered weapons', () => {
  const names = ['Greatsword', 'Dagger', 'Shield', 'Torch', 'Lantern'];
  assert.deepEqual(choose({ dark: true, names }), ['Shield', 'Lantern']);
  assert.deepEqual(choose({ dark: true, names, oil: false }), ['Shield', 'Torch']);
});

test('darkness light beats 2H mastery but pairs with usable one-handed mastery', () => {
  const names = ['Greatsword', 'Mace', 'Shield', 'Torch'];
  assert.deepEqual(choose({ dark: true, names, mastery: 'Greatsword' }), ['Shield', 'Torch']);
  assert.deepEqual(choose({ dark: true, names, mastery: 'Mace' }), ['Mace', 'Torch']);
});

test('in light, preferred 2H weapons outrank shields', () => {
  assert.deepEqual(choose({ names: ['Shield', 'Torch', 'Greatsword', 'Mace'], str: 16 }), ['Greatsword']);
  assert.deepEqual(choose({ names: ['Shield', 'Torch', 'Dagger', 'Longbow'], dex: 16 }), ['Longbow']);
  assert.deepEqual(choose({ names: ['Shield', 'Torch', 'Greatsword', 'Dagger'], mastery: 'Greatsword' }), ['Greatsword']);
  assert.deepEqual(choose({ names: ['Shield', 'Torch', 'Longbow'], str: 16 }), ['Longbow']);
  assert.deepEqual(choose({ names: ['Shield', 'Torch', 'Greatsword'], dex: 16 }), ['Greatsword']);
});

test('equal abilities follow DEX and mastery precedes ability preference', () => {
  const names = ['Greatsword', 'Dagger', 'Shortbow', 'Longbow'];
  assert.deepEqual(choose({ names }), ['Longbow']);
  assert.deepEqual(choose({ names, mastery: 'Dagger' }), ['Dagger']);
});

test('DEX melee and strongest STR weapon precede backup lights', () => {
  assert.deepEqual(choose({ names: ['Mace', 'Dagger', 'Torch'], dex: 16 }), ['Dagger', 'Torch']);
  assert.deepEqual(choose({ names: ['Mace', 'Greatsword'], str: 16 }), ['Greatsword']);
});

test('fallback order prefers DEX ranged before DEX melee and STR ranged before STR melee', () => {
  assert.deepEqual(choose({ names: ['Dagger', 'Shortbow'], str: 16 }), ['Shortbow']);
  assert.deepEqual(choose({ names: ['Mace', 'Spear'], dex: 16 }), ['Spear']);
});

test('class-excluded shields never occupy a hand', () => {
  assert.deepEqual(choose({ names: ['Shield', 'Dagger', 'Torch'], dark: true, shield: false }), ['Dagger', 'Torch']);
});

test('empty gear remains unarmed and equal-ranked choices are stable', () => {
  assert.deepEqual(choose({ names: [] }), []);
  assert.deepEqual(choose({ names: ['Mace', 'Spear'], str: 16 }), ['Mace']);
});

test('maximum damage is calculated without rolling or allocating huge dice arrays', () => {
  for (const [expression, result] of [['1d8', 8], ['2d6+3', 15], ['1d8-1d4', 7], ['d10', 10], ['1d4x2', 8], ['1', 1], ['999999999d20', 19999999980], ['bad', 0]]) {
    assert.equal(getMaximumDamage(expression), result);
  }
  assert.equal(isTwoHandedWeapon({ name: 'War Hammer' }), true);
  assert.equal(isTwoHandedWeapon({ name: 'Long Bow' }), true);
});
