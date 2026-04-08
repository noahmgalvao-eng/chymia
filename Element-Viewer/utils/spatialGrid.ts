export interface SpatialGrid {
  cellSize: number;
  buckets: Map<number, number[]>;
  activeKeys: number[];
}

const CELL_OFFSET = 2048;
const CELL_STRIDE = CELL_OFFSET * 2;
const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

const toCellKey = (cellX: number, cellY: number) => (
  ((cellX + CELL_OFFSET) * CELL_STRIDE) + (cellY + CELL_OFFSET)
);

const fromCellKey = (key: number) => {
  const shiftedX = Math.floor(key / CELL_STRIDE);
  const shiftedY = key - (shiftedX * CELL_STRIDE);

  return {
    cellX: shiftedX - CELL_OFFSET,
    cellY: shiftedY - CELL_OFFSET,
  };
};

export const createSpatialGrid = (cellSize: number): SpatialGrid => ({
  cellSize: Math.max(1, cellSize),
  buckets: new Map(),
  activeKeys: [],
});

export const resetSpatialGrid = (grid: SpatialGrid, cellSize: number) => {
  grid.cellSize = Math.max(1, cellSize);

  for (const key of grid.activeKeys) {
    const bucket = grid.buckets.get(key);
    if (bucket) {
      bucket.length = 0;
    }
  }

  grid.activeKeys.length = 0;
};

export const insertSpatialGridIndex = (
  grid: SpatialGrid,
  itemIndex: number,
  x: number,
  y: number,
) => {
  const cellX = Math.floor(x / grid.cellSize);
  const cellY = Math.floor(y / grid.cellSize);
  const key = toCellKey(cellX, cellY);

  let bucket = grid.buckets.get(key);
  if (!bucket) {
    bucket = [];
    grid.buckets.set(key, bucket);
  }

  if (bucket.length === 0) {
    grid.activeKeys.push(key);
  }

  bucket.push(itemIndex);
};

export const forEachSpatialGridPair = (
  grid: SpatialGrid,
  visitPair: (firstIndex: number, secondIndex: number) => void,
) => {
  for (const key of grid.activeKeys) {
    const bucket = grid.buckets.get(key);
    if (!bucket || bucket.length === 0) continue;

    for (let i = 0; i < bucket.length; i += 1) {
      const firstIndex = bucket[i];
      for (let j = i + 1; j < bucket.length; j += 1) {
        visitPair(firstIndex, bucket[j]);
      }
    }

    const { cellX, cellY } = fromCellKey(key);
    for (const [offsetX, offsetY] of NEIGHBOR_OFFSETS) {
      const neighborBucket = grid.buckets.get(toCellKey(cellX + offsetX, cellY + offsetY));
      if (!neighborBucket || neighborBucket.length === 0) continue;

      for (const firstIndex of bucket) {
        for (const secondIndex of neighborBucket) {
          visitPair(firstIndex, secondIndex);
        }
      }
    }
  }
};
