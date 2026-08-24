"use client";

import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
} from "lightweight-charts";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useState,
} from "react";

import type { Candle } from "@/lib/types";

import {
  createDrawing,
  requiredAnchors,
  snapAnchor,
  translateDrawing,
} from "./engine";
import type {
  DrawingAnchor,
  DrawingTool,
  FocusDrawing,
  SnapMode,
} from "../types";

type Projected = FocusDrawing & {
  points: Array<{ x: number; y: number }>;
};

type DragState = {
  drawing: FocusDrawing;
  anchorIndex: number | null;
  start: DrawingAnchor;
};

function pointerAnchor(
  event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  candles: Candle[],
): DrawingAnchor | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const chartTime = chart.timeScale().coordinateToTime(x);
  const price = series.coordinateToPrice(y);
  if (price === null || !candles.length) return null;
  if (typeof chartTime === "number") return { time: Number(chartTime), price };

  // Lightweight Charts returns null in the whitespace before or after the
  // loaded series. Draw on the closest real observation instead of silently
  // dropping the user's click or inventing a timestamp.
  const ratio = Math.max(0, Math.min(1, x / Math.max(bounds.width, 1)));
  const candleIndex = Math.round(ratio * (candles.length - 1));
  return { time: candles[candleIndex].time, price };
}

export function DrawingInteractionLayer({
  chart,
  series,
  drawings,
  activeTool,
  snapMode,
  candles,
  selectedId,
  viewportVersion,
  onAdd,
  onUpdate,
  onSelect,
}: {
  chart: IChartApi | null;
  series: ISeriesApi<SeriesType> | null;
  drawings: FocusDrawing[];
  activeTool: DrawingTool;
  snapMode: SnapMode;
  candles: Candle[];
  selectedId: string | null;
  viewportVersion: number;
  onAdd: (drawing: FocusDrawing) => void;
  onUpdate: (id: string, update: Partial<FocusDrawing>) => void;
  onSelect: (id: string | null) => void;
}) {
  const [pending, setPending] = useState<DrawingAnchor[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<FocusDrawing | null>(null);

  const projected = useMemo<Projected[]>(() => {
    void viewportVersion;
    if (!chart || !series) return [];
    return drawings.flatMap((drawing) => {
      const points = drawing.anchors.flatMap((anchor) => {
        const x = chart.timeScale().timeToCoordinate(anchor.time as Time);
        const y = series.priceToCoordinate(anchor.price);
        return x === null || y === null ? [] : [{ x: Number(x), y: Number(y) }];
      });
      return points.length ? [{ ...drawing, points }] : [];
    });
  }, [chart, drawings, series, viewportVersion]);

  const beginDraw = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (!chart || !series || activeTool === "cursor") {
      onSelect(null);
      return;
    }
    const raw = pointerAnchor(event, chart, series, candles);
    if (!raw) return;
    const anchor = snapAnchor(raw, candles, snapMode);
    const anchors = [...pending, anchor];
    if (anchors.length >= requiredAnchors(activeTool)) {
      onAdd(createDrawing(activeTool, anchors));
      setPending([]);
    } else {
      setPending(anchors);
    }
  };

  const beginDrag = (
    event: ReactPointerEvent<SVGElement>,
    drawing: FocusDrawing,
    anchorIndex: number | null,
  ) => {
    event.stopPropagation();
    if (!chart || !series || drawing.locked) {
      onSelect(drawing.id);
      return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const time = chart.timeScale().coordinateToTime(event.clientX - bounds.left);
    const price = series.coordinateToPrice(event.clientY - bounds.top);
    if (typeof time !== "number" || price === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(drawing.id);
    setDrag({ drawing, anchorIndex, start: { time: Number(time), price } });
    setDraft(drawing);
  };

  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || !chart || !series) return;
    const current = pointerAnchor(event, chart, series, candles);
    if (!current) return;
    if (drag.anchorIndex === null) {
      setDraft(translateDrawing(
        drag.drawing,
        current.time - drag.start.time,
        current.price - drag.start.price,
      ));
      return;
    }
    const anchors = drag.drawing.anchors.map((anchor, index) => (
      index === drag.anchorIndex
        ? snapAnchor(current, candles, snapMode)
        : anchor
    ));
    setDraft({ ...drag.drawing, anchors });
  };

  const finishDrag = () => {
    if (drag && draft) onUpdate(drag.drawing.id, { anchors: draft.anchors });
    setDrag(null);
    setDraft(null);
  };

  const visible = draft
    ? projected.map((item) => item.id === draft.id ? {
        ...item,
        anchors: draft.anchors,
        points: item.points,
      } : item)
    : projected;

  return (
    <svg
      aria-label="Surface de dessin Focus Pro"
      onClick={beginDraw}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 6,
        cursor: activeTool === "cursor" ? "crosshair" : "cell",
        pointerEvents: activeTool === "cursor" ? "none" : "auto",
      }}
    >
      {visible.map((drawing) => {
        const first = drawing.points[0];
        const second = drawing.points[1] ?? first;
        const selected = drawing.id === selectedId;
        return (
          <g
            key={drawing.id}
            opacity={drawing.hidden ? 0 : 1}
            style={{ pointerEvents: "auto", cursor: drawing.locked ? "not-allowed" : "move" }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => beginDrag(event, drawing, null)}
          >
            <line
              x1={first.x}
              y1={first.y}
              x2={second.x}
              y2={second.y}
              stroke="transparent"
              strokeWidth={18}
            />
            {selected && drawing.anchors.map((_, index) => {
              const point = drawing.points[index];
              return point ? (
                <circle
                  key={`${drawing.id}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={5}
                  fill="#071521"
                  stroke={drawing.color}
                  strokeWidth={2}
                  onPointerDown={(event) => beginDrag(event, drawing, index)}
                />
              ) : null;
            })}
          </g>
        );
      })}
      {pending.map((anchor, index) => {
        if (!chart || !series) return null;
        const x = chart.timeScale().timeToCoordinate(anchor.time as Time);
        const y = series.priceToCoordinate(anchor.price);
        return x === null || y === null ? null : (
          <circle key={index} cx={Number(x)} cy={Number(y)} r={5} fill="#f6b94a" />
        );
      })}
    </svg>
  );
}
