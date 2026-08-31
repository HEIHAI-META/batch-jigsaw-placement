import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFullyInsideRect, buildBatchLayout } from '../src/batch-placement-layout.js';

test('lays pieces out in selection order using a compact near-square grid', () => {
  const pieces = [7, 2, 9, 4, 1].map((id) => ({ id }));
  const layout = buildBatchLayout(pieces);

  assert.deepEqual(layout.map(({ piece, x, y }) => [piece.id, x, y]), [
    [7, 0, 0],
    [2, 52, 0],
    [9, 104, 0],
    [4, 0, 52],
    [1, 52, 52],
  ]);
});

test('requires every preview piece to remain fully inside the play space', () => {
  const rect = { width: 393, height: 536 };
  const bounds = { width: 154, height: 102 };

  assert.equal(batchFullyInsideRect({ x: 20, y: 40 }, bounds, rect), true);
  assert.equal(batchFullyInsideRect({ x: -1, y: 40 }, bounds, rect), false);
  assert.equal(batchFullyInsideRect({ x: 240, y: 40 }, bounds, rect), false);
  assert.equal(batchFullyInsideRect({ x: 20, y: 435 }, bounds, rect), false);
});
