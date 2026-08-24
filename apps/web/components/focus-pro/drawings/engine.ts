import type { Candle } from "@/lib/types";

import {
  DEFAULT_FIB_EXTENSION,
  DEFAULT_FIB_RETRACEMENT,
  type DrawingAnchor,
  type DrawingTool,
  type FocusDrawing,
  type SnapMode,
} from "../types";

export type DrawingState = {
  items: FocusDrawing[];
  past: FocusDrawing[][];
  future: FocusDrawing[][];
  selectedId: string | null;
};

export type DrawingAction =
  | { type: "replace"; items: FocusDrawing[] }
  | { type: "add"; drawing: FocusDrawing }
  | { type: "update"; id: string; update: Partial<FocusDrawing> }
  | { type: "delete"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "select"; id: string | null }
  | { type: "undo" }
  | { type: "redo" };

export const INITIAL_DRAWING_STATE: DrawingState = {
  items: [],
  past: [],
  future: [],
  selectedId: null,
};

function checkpoint(state: DrawingState, items: FocusDrawing[]): DrawingState {
  return {
    items: items.slice(0, 50),
    past: [...state.past, state.items].slice(-50),
    future: [],
    selectedId: state.selectedId,
  };
}

export function drawingReducer(
  state: DrawingState,
  action: DrawingAction,
): DrawingState {
  if (action.type === "select") return { ...state, selectedId: action.id };
  if (action.type === "replace") {
    return { ...INITIAL_DRAWING_STATE, items: action.items.slice(0, 50) };
  }
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      items: previous,
      past: state.past.slice(0, -1),
      future: [state.items, ...state.future].slice(0, 50),
      selectedId: null,
    };
  }
  if (action.type === "redo") {
    const next = state.future.at(0);
    if (!next) return state;
    return {
      items: next,
      past: [...state.past, state.items].slice(-50),
      future: state.future.slice(1),
      selectedId: null,
    };
  }
  if (action.type === "add") {
    if (state.items.length >= 50) return state;
    return { ...checkpoint(state, [...state.items, action.drawing]), selectedId: action.drawing.id };
  }
  if (action.type === "update") {
    const target = state.items.find((item) => item.id === action.id);
    if (!target || target.locked && action.update.anchors) return state;
    return {
      ...checkpoint(
        state,
        state.items.map((item) => item.id === action.id ? { ...item, ...action.update } : item),
      ),
      selectedId: action.id,
    };
  }
  if (action.type === "delete") {
    return {
      ...checkpoint(state, state.items.filter((item) => item.id !== action.id)),
      selectedId: state.selectedId === action.id ? null : state.selectedId,
    };
  }
  const target = state.items.find((item) => item.id === action.id);
  if (!target || state.items.length >= 50) return state;
  const copy: FocusDrawing = {
    ...target,
    id: `${target.id}-copy-${Date.now()}`,
    anchors: target.anchors.map((anchor) => ({
      time: anchor.time,
      price: anchor.price,
    })),
    locked: false,
  };
  return { ...checkpoint(state, [...state.items, copy]), selectedId: copy.id };
}

export function requiredAnchors(tool: DrawingTool): number {
  if (tool === "cursor") return 0;
  if (tool === "horizontal_line" || tool === "vertical_line" || tool === "text") return 1;
  if (tool === "parallel_channel") return 3;
  return 2;
}

export function createDrawing(
  tool: Exclude<DrawingTool, "cursor">,
  anchors: DrawingAnchor[],
): FocusDrawing {
  return {
    id: `${tool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tool,
    anchors,
    text: tool === "text" ? "Note Anatole" : null,
    color: tool.startsWith("fib") ? "#f6b94a" : "#2c9cff",
    line_width: 2,
    locked: false,
    hidden: false,
    fib_levels: tool === "fib_retracement"
      ? [...DEFAULT_FIB_RETRACEMENT]
      : tool === "fib_extension"
        ? [...DEFAULT_FIB_EXTENSION]
        : [],
  };
}

function nearestCandle(candles: Candle[], time: number): Candle | null {
  if (!candles.length) return null;
  let best = candles[0];
  let distance = Math.abs(best.time - time);
  for (const candle of candles.slice(1)) {
    const candidateDistance = Math.abs(candle.time - time);
    if (candidateDistance < distance) {
      best = candle;
      distance = candidateDistance;
    }
  }
  return best;
}

export function snapAnchor(
  anchor: DrawingAnchor,
  candles: Candle[],
  mode: SnapMode,
): DrawingAnchor {
  if (mode === "none") return anchor;
  const candle = nearestCandle(candles, anchor.time);
  if (!candle) return anchor;
  const prices = mode === "high_low"
    ? [candle.high, candle.low]
    : [candle.open, candle.high, candle.low, candle.close];
  const price = prices.reduce((nearest, candidate) => (
    Math.abs(candidate - anchor.price) < Math.abs(nearest - anchor.price)
      ? candidate
      : nearest
  ));
  return { time: candle.time, price };
}

export function drawingPriceAtTime(
  drawing: FocusDrawing,
  time: number,
): number | null {
  const first = drawing.anchors[0];
  if (!first) return null;
  if (drawing.tool === "horizontal_line") return first.price;
  const second = drawing.anchors[1];
  if (!second || second.time === first.time) return first.price;
  const slope = (second.price - first.price) / (second.time - first.time);
  return first.price + slope * (time - first.time);
}

export function translateDrawing(
  drawing: FocusDrawing,
  deltaTime: number,
  deltaPrice: number,
): FocusDrawing {
  if (drawing.locked) return drawing;
  return {
    ...drawing,
    anchors: drawing.anchors.map((anchor) => ({
      time: Math.max(0, Math.round(anchor.time + deltaTime)),
      price: anchor.price + deltaPrice,
    })),
  };
}
