import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLD_DELAY,
  PICKER_CLOSE_ANIMATION_DURATION,
  holdShouldCancel,
  pointInsideRect,
} from '../src/pickup-gesture.js';

test('keeps a nearly stationary press eligible for long-press pickup', () => {
  assert.equal(holdShouldCancel({ x: 100, y: 200 }, { x: 106, y: 207 }), false);
});

test('cancels pickup as soon as the gesture becomes a scroll', () => {
  assert.equal(holdShouldCancel({ x: 100, y: 200 }, { x: 100, y: 210 }), true);
});

test('uses the requested pickup and retract animation timings', () => {
  assert.equal(HOLD_DELAY, 500);
  assert.equal(PICKER_CLOSE_ANIMATION_DURATION, 650);
});

test('accepts the full play-space, including white margins outside the gray board', () => {
  const playSpace = { left: 0, right: 393, top: 116, bottom: 652 };
  assert.equal(pointInsideRect({ clientX: 8, clientY: 130 }, playSpace), true);
  assert.equal(pointInsideRect({ clientX: 385, clientY: 640 }, playSpace), true);
  assert.equal(pointInsideRect({ clientX: 196, clientY: 700 }, playSpace), false);
});
