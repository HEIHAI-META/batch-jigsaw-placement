export const HOLD_DELAY = 500;
export const SCROLL_CANCEL_DISTANCE = 10;
export const PICKER_CLOSE_ANIMATION_DURATION = 650;

export function holdShouldCancel(start, current) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= SCROLL_CANCEL_DISTANCE;
}

export function pointInsideRect({ clientX, clientY }, rect) {
  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom;
}
