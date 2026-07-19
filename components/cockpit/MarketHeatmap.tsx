import Link from "next/link";
import type { MarketTile } from "@/lib/types";

function tileClass(change: number): string {
  if (change >= 2) return "heat-strong-up";
  if (change >= 0.5) return "heat-up";
  if (change > 0.05) return "heat-soft-up";
  if (change <= -2) return "heat-strong-down";
  if (change <= -0.5) return "heat-down";
  if (change < -0.05) return "heat-soft-down";
  return "heat-flat";
}

function tileSpan(weight: number): string {
  if (weight >= 5) return "heat-xl";
  if (weight >= 3) return "heat-lg";
  if (weight >= 1.2) return "heat-md";
  return "heat-sm";
}

export function MarketHeatmap({ tiles }: { tiles: MarketTile[] }) {
  return (
    <section className="panel cockpit-heatmap-panel">
      <div className="cockpit-section-heading">
        <div><span className="eyebrow">CARTE DU MARCHÉ</span><h2>S&P/TSX 60</h2></div>
        <span className="muted small-copy">Clique sur un titre pour ouvrir Focus</span>
      </div>
      <div className="market-heatmap" aria-label="Carte thermique du S&P/TSX 60">
        {tiles.map((tile) => (
          <Link
            href={`/focus/${encodeURIComponent(tile.symbol)}`}
            key={tile.symbol}
            className={`heat-tile ${tileClass(tile.change_percent)} ${tileSpan(tile.weight)}`}
            title={`${tile.name} · ${tile.change_percent.toFixed(2)} %`}
          >
            <strong>{tile.symbol}</strong>
            <span>{tile.change_percent >= 0 ? "+" : ""}{tile.change_percent.toFixed(2)}%</span>
            <small>{tile.price.toFixed(2)} $</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
