import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carryStackFullyAboveBoundary,
  visibleCarryPieceIds,
} from '../src/carry-stack-geometry.js';

test('shows only two visible layers while preserving the held piece on top', () => {
  assert.deepEqual(visibleCarryPieceIds([1, 2, 3, 4, 5, 6], 4), [1, 4]);
  assert.deepEqual(visibleCarryPieceIds([3], 3), [3]);
});

test('keeps the picker open while any part of the aggregate remains below the red line', () => {
  assert.equal(carryStackFullyAboveBoundary({ clientY: 333 }, 300), false);
});

test('closes only after the whole aggregate has crossed above the red line', () => {
  assert.equal(carryStackFullyAboveBoundary({ clientY: 328 }, 300), true);
});
