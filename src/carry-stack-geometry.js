export const CARRY_STACK_OFFSET_X = 2.5;
export const CARRY_STACK_OFFSET_Y = 1.75;
export const CARRY_STACK_SCALE = 1.16;
export const CARRY_STACK_LIFT = 13;

const CARRY_PIECE_SIZE = 50;
const ROTATION_ALLOWANCE = 2;

export function visibleCarryPieceIds(selectedIds, heldId) {
  const topId = selectedIds.includes(heldId) ? heldId : selectedIds.at(-1);
  if (topId == null) return [];
  const backId = selectedIds.find((id) => id !== topId);
  return backId == null ? [topId] : [backId, topId];
}

export function carryStackFullyAboveBoundary({ clientY }, boundaryTop) {
  const visualBottom = clientY - 72
    + CARRY_PIECE_SIZE / 2
    - CARRY_STACK_LIFT
    + CARRY_PIECE_SIZE * CARRY_STACK_SCALE / 2
    + ROTATION_ALLOWANCE;
  return visualBottom <= boundaryTop;
}
