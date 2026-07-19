import Link from "next/link";
import type { MarketTile } from "@/lib/types";

export function MoversList({ title, items }: { title: string; items: MarketTile[] }) {
  return (
    <section className="panel movers-panel">
      <div className="cockpit-section-heading"><h2>{title}</h2></div>
      <div className="movers-list">
        {items.map((item) => (
          <Link href={`/focus/${encodeURIComponent(item.symbol)}`} className="mover-row" key={item.symbol}>
            <div><strong>{item.symbol}</strong><span>{item.name}</span></div>
            <div className={item.change_percent >= 0 ? "positive" : "negative"}>
              <strong>{item.change_percent >= 0 ? "+" : ""}{item.change_percent.toFixed(2)}%</strong>
              <span>{item.price.toFixed(2)} $</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
