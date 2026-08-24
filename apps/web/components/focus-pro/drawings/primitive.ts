import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";

import type { FocusDrawing } from "../types";

type Point = { x: number; y: number };
type ProjectedDrawing = FocusDrawing & {
  points: Point[];
  fibPoints: Array<{ level: number; left: Point; right: Point; price: number }>;
};

class DrawingRenderer implements IPrimitivePaneRenderer {
  drawings: ProjectedDrawing[] = [];

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      context.save();
      context.font = "11px system-ui, sans-serif";
      for (const drawing of this.drawings) {
        if (drawing.hidden || !drawing.points.length) continue;
        context.strokeStyle = drawing.color;
        context.fillStyle = drawing.color;
        context.lineWidth = drawing.line_width;
        context.globalAlpha = drawing.locked ? 0.58 : 0.9;
        const first = drawing.points[0];
        const second = drawing.points[1] ?? first;
        context.beginPath();
        if (drawing.tool === "horizontal_line") {
          context.moveTo(0, first.y);
          context.lineTo(mediaSize.width, first.y);
        } else if (drawing.tool === "vertical_line") {
          context.moveTo(first.x, 0);
          context.lineTo(first.x, mediaSize.height);
        } else if (drawing.tool === "rectangle") {
          context.globalAlpha = 0.16;
          context.fillRect(first.x, first.y, second.x - first.x, second.y - first.y);
          context.globalAlpha = drawing.locked ? 0.58 : 0.9;
          context.rect(first.x, first.y, second.x - first.x, second.y - first.y);
        } else if (drawing.tool === "ray") {
          const denominator = second.x - first.x;
          const slope = denominator === 0 ? 0 : (second.y - first.y) / denominator;
          const endX = second.x >= first.x ? mediaSize.width : 0;
          context.moveTo(first.x, first.y);
          context.lineTo(endX, first.y + slope * (endX - first.x));
        } else if (drawing.tool === "parallel_channel" && drawing.points[2]) {
          const third = drawing.points[2];
          const deltaX = second.x - first.x;
          const deltaY = second.y - first.y;
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.moveTo(third.x, third.y);
          context.lineTo(third.x + deltaX, third.y + deltaY);
          context.globalAlpha = 0.08;
          context.fillStyle = drawing.color;
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.lineTo(third.x + deltaX, third.y + deltaY);
          context.lineTo(third.x, third.y);
          context.closePath();
          context.fill();
          context.globalAlpha = drawing.locked ? 0.58 : 0.9;
        } else if (drawing.tool.startsWith("fib_")) {
          for (const fib of drawing.fibPoints) {
            context.beginPath();
            context.moveTo(fib.left.x, fib.left.y);
            context.lineTo(fib.right.x, fib.right.y);
            context.stroke();
            context.fillText(
              `${fib.level.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} · ${fib.price.toFixed(2)}`,
              Math.min(fib.left.x, fib.right.x) + 5,
              fib.left.y - 3,
            );
          }
          continue;
        } else if (drawing.tool === "price_range") {
          context.moveTo(first.x, first.y);
          context.lineTo(first.x, second.y);
          context.moveTo(first.x - 6, first.y);
          context.lineTo(first.x + 6, first.y);
          context.moveTo(first.x - 6, second.y);
          context.lineTo(first.x + 6, second.y);
          context.fillText(
            `${drawing.anchors[1] && drawing.anchors[0].price !== 0
              ? ((drawing.anchors[1].price / drawing.anchors[0].price - 1) * 100).toFixed(2)
              : "0.00"} %`,
            first.x + 10,
            (first.y + second.y) / 2,
          );
        } else if (drawing.tool === "date_range") {
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, first.y);
          context.fillText(
            `${Math.max(0, Math.round(Math.abs(drawing.anchors[1].time - drawing.anchors[0].time) / 86_400))} j`,
            (first.x + second.x) / 2,
            first.y - 5,
          );
        } else if (drawing.tool === "text") {
          context.fillText(drawing.text || "Note Anatole", first.x + 5, first.y - 5);
          continue;
        } else {
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
        }
        context.stroke();
      }
      context.restore();
    });
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  constructor(private readonly drawingRenderer: DrawingRenderer) {}

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.drawingRenderer;
  }
}

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private params: SeriesAttachedParameter<Time> | null = null;
  private drawings: FocusDrawing[] = [];
  private readonly drawingRenderer = new DrawingRenderer();
  private readonly view = new DrawingPaneView(this.drawingRenderer);

  attached(params: SeriesAttachedParameter<Time>): void {
    this.params = params;
    this.updateAllViews();
  }

  detached(): void {
    this.params = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  setDrawings(drawings: FocusDrawing[]): void {
    this.drawings = drawings;
    this.updateAllViews();
    this.params?.requestUpdate();
  }

  updateAllViews(): void {
    if (!this.params) return;
    const timeScale = this.params.chart.timeScale();
    const series = this.params.series;
    this.drawingRenderer.drawings = this.drawings.flatMap((drawing) => {
      const points = drawing.anchors.flatMap((anchor) => {
        const x = timeScale.timeToCoordinate(anchor.time as Time);
        const y = series.priceToCoordinate(anchor.price);
        return x === null || y === null ? [] : [{ x: Number(x), y: Number(y) }];
      });
      if (!points.length) return [];
      const first = drawing.anchors[0];
      const second = drawing.anchors[1] ?? first;
      const leftX = points[0].x;
      const rightX = points[1]?.x ?? points[0].x + 180;
      const fibPoints = drawing.fib_levels.flatMap((level) => {
        const price = first.price + (second.price - first.price) * level;
        const y = series.priceToCoordinate(price);
        return y === null ? [] : [{
          level,
          price,
          left: { x: leftX, y: Number(y) },
          right: { x: rightX, y: Number(y) },
        }];
      });
      return [{ ...drawing, points, fibPoints }];
    });
  }
}
