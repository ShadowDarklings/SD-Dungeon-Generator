import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCharacterState } from '../../S3_content/src/characters.js';
import {
  hydrateDungeonState,
  importShadowdarklingsCharacter,
  serializeDungeonState
} from '../../S3_content/src/persistence.js';
import { normalizeSessionCode } from '../../S3_content/src/multiplayer.js';

test('repeated synchronization does not nest character raw data', () => {
  const state = { characters: [{ id: 'hero', name: 'Hero', class: 'Fighter', hp: 8, maxHitPoints: 8, gear: [], stats: { STR: 12 }, importedField: 'preserved' }] };
  for (let i = 0; i < 100; i += 1) normalizeCharacterState(state);
  assert.equal(state.characters[0].raw.raw, undefined);
  assert.equal(state.characters[0].raw.importedField, 'preserved');
  assert.ok(JSON.stringify(state).length < 10000);
});

test('room snapshots preserve visibility collections and save revisions', () => {
  const state = { characters: [], run: { id: 4, revision: 7, name: 'Crypt' }, visibility: {
    visibleNow: new Set(['1,2']), exploredEver: new Set(['1,2']), closedDoorExploredSides: new Map([['door', new Set(['north'])]])
  } };
  const roundtrip = hydrateDungeonState(serializeDungeonState(state));
  assert.equal(roundtrip.run.revision, 7);
  assert.deepEqual([...roundtrip.visibility.visibleNow], ['1,2']);
  assert.deepEqual([...roundtrip.visibility.closedDoorExploredSides.get('door')], ['north']);
});

test('four-character invitations accept codes or current invite links', () => {
  assert.equal(normalizeSessionCode(' k7mt '), 'K7MT');
  assert.equal(normalizeSessionCode('https://ctreeder.com/site/?join=k7mt'), 'K7MT');
  assert.equal(normalizeSessionCode('https://ctreeder.com/site/?room=not-an-invite'), '');
});

test('character imports replace proxy HTML errors with a useful message', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = { location: { hostname: 'ctreeder.com' } };
  globalThis.fetch = async (path) => {
    if (path === '/api/session') {
      return new Response(JSON.stringify({ csrf_token: 'test-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response('<html>Bad gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' }
    });
  };

  try {
    await assert.rejects(
      importShadowdarklingsCharacter(),
      /character import server timed out/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
