import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDungeonState } from '../../S3_content/src/state-schema.js';
import { recomputeVisibility } from '../../S3_content/src/visibility.js';
import { collectLightSources, computeLightPolygon, isPointInPolygon, isTileTouchedByLightPolygon } from '../../S3_content/src/light-geometry.js';

function referencePointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.000001) + xi) inside = !inside;
  }
  return inside;
}

test('cached polygon bounds preserve convex, concave, and boundary ray tests', () => {
  const polygons = [
    [[0, 0], [10, 0], [10, 10], [0, 10]],
    [[-5, -5], [8, -2], [2, 2], [8, 8], [-5, 8]],
    [[0, 0], [0, 10], [10, 5]],
  ];
  for (const polygon of polygons) {
    for (let x = -10; x <= 15; x += 0.5) {
      for (let y = -10; y <= 15; y += 0.5) {
        assert.equal(isPointInPolygon([x, y], polygon), referencePointInPolygon([x, y], polygon), `${x},${y}`);
      }
    }
  }
  assert.equal(isPointInPolygon([0, 0], []), false);
});

test('light-radius culling matches an exhaustive tile scan, including fractional positions', () => {
  const state = createEmptyDungeonState(12345);
  state.map = { width: 30, height: 20 };
  state.tiles = Array.from({ length: 600 }, (_, i) => ({
    x: i % 30, y: Math.floor(i / 30), type: i % 30 === 20 ? 'wall' : 'floor', meta: {}
  }));
  state.player.torchLit = false;
  state.characters = [{ id: 'light', x: 6, y: 6, lightRadius: 6 }];
  for (const radius of [0.1, 1, 3, 6, 10]) {
    for (const x of [0, 6.25, 19.5, 29]) {
      Object.assign(state.characters[0], { x, lightRadius: radius });
      const polygons = collectLightSources(state).map(source => computeLightPolygon(state, source));
      const expected = state.tiles.filter(tile => polygons.some(polygon => isTileTouchedByLightPolygon(tile, polygon)))
        .map(tile => `${tile.x},${tile.y}`).sort();
      recomputeVisibility(state);
      assert.deepEqual([...state.visibility.visibleNow].sort(), expected, `radius=${radius}, x=${x}`);
    }
  }
  const before = structuredClone(state.visibility.exploredLightPolygonsBeforeNow);
  const previousList = state.visibility.exploredLightPolygonsBeforeNow;
  state.characters[0].x = 12;
  recomputeVisibility(state);
  assert.deepEqual(previousList, before, 'later exploration must not mutate an earlier fog snapshot');
});
