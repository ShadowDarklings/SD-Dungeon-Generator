import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLightSources } from '../../S3_content/src/light-geometry.js';

function openDungeon() {
  const width = 24;
  const height = 5;
  return {
    map: { width, height },
    tiles: Array.from({ length: width * height }, (_, index) => ({
      x: index % width,
      y: Math.floor(index / width),
      type: 'floor',
      roomId: 'room'
    })),
    rooms: [{ id: 'room', x: 0, y: 0, width, height }],
    entities: [],
    decor: {},
    sharedRoom: true,
    viewerCharacterIds: new Set(['user-b']),
    characters: [
      { id: 'user-a', x: 2, y: 2, lightRadius: 6 },
      { id: 'user-b', x: 1, y: 2, lightRadius: 0 }
    ]
  };
}

test('another player light illuminates a viewer only while it reaches them', () => {
  const state = openDungeon();
  assert.equal(collectLightSources(state).length, 1);

  state.characters[0].x = 18;
  assert.equal(collectLightSources(state).length, 0);

  state.characters[1].lightRadius = 6;
  const ownLights = collectLightSources(state);
  assert.equal(ownLights.length, 1);
  assert.deepEqual([ownLights[0].x, ownLights[0].y], [1, 2]);
});
