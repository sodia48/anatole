"use client";

import Link from "next/link";
import { useState } from "react";
import type { MarketTile } from "@/lib/types";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";
import styles from "./CockpitSummary.module.css";

export function QuoteTape({ tiles, language }: { tiles: MarketTile[]; language: AnatoleLanguage }) {
  const [paused, setPaused] = useState(false);
  const quotes = tiles.map((tile) => (
    <Link className={styles.quote} key={tile.ticker} href={`/focus/${encodeURIComponent(tile.ticker)}`}>
      <span>{tile.symbol}</span>
      <strong>{Number.isFinite(tile.price) && tile.price > 0
        ? tile.price.toLocaleString(localeFor(language), { style: "currency", currency: "CAD" }) : "—"}</strong>
      <b className={tile.change_percent >= 0 ? styles.positive : styles.negative}>
        {Number.isFinite(tile.change_percent) ? `${tile.change_percent >= 0 ? "+" : ""}${tile.change_percent.toFixed(2)}%` : "—"}
      </b>
    </Link>
  ));
  return <section className={styles.tape} aria-label={pick(language, "Cotations défilantes du panier", "Scrolling basket quotes")}>
    <div className={styles.viewport} data-paused={paused} tabIndex={0}>
      <div className={styles.track} style={{ animationDuration: `${Math.max(30, tiles.length * 4)}s` }}>
        <div className={styles.group}>{quotes}</div>
        <div className={styles.group} aria-hidden="true" inert>{quotes}</div>
      </div>
    </div>
    <button type="button" className={styles.pause} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
      {paused ? pick(language, "Reprendre", "Resume") : pick(language, "Pause", "Pause")}
    </button>
  </section>;
}
