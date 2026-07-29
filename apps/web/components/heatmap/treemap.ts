export type TreemapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeightedTreemapItem<T> = {
  item: T;
  weight: number;
};

export type PositionedTreemapItem<T> = {
  item: T;
  rect: TreemapRect;
};

type AreaItem<T> = {
  item: T;
  area: number;
};

export function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function rowScore<T>(
  row: AreaItem<T>[],
  shortSide: number,
): number {
  if (row.length === 0 || shortSide <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const areas = row.map((entry) => Math.max(entry.area, 0.0001));
  const total = areas.reduce((sum, area) => sum + area, 0);
  const largest = Math.max(...areas);
  const smallest = Math.min(...areas);
  const sideSquared = shortSide * shortSide;
  const totalSquared = total * total;

  return Math.max(
    (sideSquared * largest) / totalSquared,
    totalSquared / (sideSquared * smallest),
  );
}

function layoutRow<T>(
  row: AreaItem<T>[],
  rect: TreemapRect,
): {
  positioned: PositionedTreemapItem<T>[];
  remaining: TreemapRect;
} {
  const rowArea = row.reduce((sum, entry) => sum + entry.area, 0);

  if (rect.width >= rect.height) {
    const rowWidth = rect.height > 0 ? rowArea / rect.height : 0;
    let cursorY = rect.y;
    const positioned = row.map((entry, index) => {
      const height =
        index === row.length - 1
          ? rect.y + rect.height - cursorY
          : rowWidth > 0
            ? entry.area / rowWidth
            : 0;
      const itemRect = {
        x: rect.x,
        y: cursorY,
        width: rowWidth,
        height,
      };
      cursorY += height;
      return { item: entry.item, rect: itemRect };
    });

    return {
      positioned,
      remaining: {
        x: rect.x + rowWidth,
        y: rect.y,
        width: Math.max(rect.width - rowWidth, 0),
        height: rect.height,
      },
    };
  }

  const rowHeight = rect.width > 0 ? rowArea / rect.width : 0;
  let cursorX = rect.x;
  const positioned = row.map((entry, index) => {
    const width =
      index === row.length - 1
        ? rect.x + rect.width - cursorX
        : rowHeight > 0
          ? entry.area / rowHeight
          : 0;
    const itemRect = {
      x: cursorX,
      y: rect.y,
      width,
      height: rowHeight,
    };
    cursorX += width;
    return { item: entry.item, rect: itemRect };
  });

  return {
    positioned,
    remaining: {
      x: rect.x,
      y: rect.y + rowHeight,
      width: rect.width,
      height: Math.max(rect.height - rowHeight, 0),
    },
  };
}

/**
 * Squarified treemap layout.
 *
 * Compared with a binary split, this layout strongly reduces long, narrow
 * strips. That matters on phones because the ticker and its variation remain
 * legible in a much larger share of the available tiles.
 */
export function squarifyTreemap<T>(
  entries: WeightedTreemapItem<T>[],
  rect: TreemapRect,
): PositionedTreemapItem<T>[] {
  if (
    entries.length === 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return [];
  }

  const totalWeight = entries.reduce(
    (sum, entry) => sum + Math.max(entry.weight, 0.0001),
    0,
  );
  const totalArea = rect.width * rect.height;
  const items: AreaItem<T>[] = [...entries]
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => ({
      item: entry.item,
      area:
        totalWeight > 0
          ? (Math.max(entry.weight, 0.0001) / totalWeight) * totalArea
          : totalArea / entries.length,
    }));

  const positioned: PositionedTreemapItem<T>[] = [];
  let remaining = { ...rect };
  let row: AreaItem<T>[] = [];
  let index = 0;

  while (index < items.length) {
    const candidate = items[index];
    const shortSide = Math.max(Math.min(remaining.width, remaining.height), 0.0001);
    const nextRow = [...row, candidate];

    if (
      row.length === 0 ||
      rowScore(nextRow, shortSide) <= rowScore(row, shortSide)
    ) {
      row = nextRow;
      index += 1;
      continue;
    }

    const laidOut = layoutRow(row, remaining);
    positioned.push(...laidOut.positioned);
    remaining = laidOut.remaining;
    row = [];
  }

  if (row.length > 0) {
    const laidOut = layoutRow(row, remaining);
    positioned.push(...laidOut.positioned);
  }

  return positioned;
}

export function insetRect(
  rect: TreemapRect,
  amount: number,
): TreemapRect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(rect.width - amount * 2, 0),
    height: Math.max(rect.height - amount * 2, 0),
  };
}
