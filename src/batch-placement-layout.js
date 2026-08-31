export function buildBatchLayout(pieces, step = 52) {
  const columns = Math.ceil(Math.sqrt(pieces.length));
  return pieces.map((piece, index) => ({
    piece,
    x: (index % columns) * step,
    y: Math.floor(index / columns) * step,
  }));
}

export function batchFullyInsideRect(origin, bounds, rect) {
  return origin.x >= 0
    && origin.y >= 0
    && origin.x + bounds.width <= rect.width
    && origin.y + bounds.height <= rect.height;
}
