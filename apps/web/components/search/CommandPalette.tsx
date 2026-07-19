"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  Newspaper,
  Search,
  Settings2,
  Star,
  TableProperties,
  X,
} from "lucide-react";
import { searchSymbols } from "@/lib/api";
import type { SymbolSearchItem } from "@/lib/types";

const routes = [
  { label: "Cockpit TSX 60", description: "Heatmap, largeur et secteurs", href: "/cockpit", icon: LayoutDashboard, available: true },
  { label: "Focus", description: "Analyse complète d’un titre", href: "/focus/RY", icon: BarChart3, available: true },
  { label: "Watchlist", description: "Titres suivis et variations", href: "/watchlist", icon: Star, available: true },
  { label: "Screener", description: "Filtres et classement des actions", href: "/roadmap#screener", icon: TableProperties, available: false },
  { label: "Actualités", description: "Flux d’information du marché", href: "/roadmap#actualites", icon: Newspaper, available: false },
  { label: "Calendrier", description: "Événements économiques", href: "/roadmap#calendrier", icon: CalendarDays, available: false },
  { label: "Comparateur", description: "Comparer plusieurs titres", href: "/roadmap#comparateur", icon: GitCompareArrows, available: false },
  { label: "Portefeuille", description: "Positions et performance", href: "/roadmap#portefeuille", icon: BriefcaseBusiness, available: false },
  { label: "Terminal Pro", description: "Régime, score et dislocations", href: "/roadmap#terminal", icon: Gauge, available: false },
  { label: "Préférences", description: "Thème, densité et affichage", href: "/preferences", icon: Settings2, available: true },
];

function normalizeTicker(value: string): string {
  return value.toUpperCase().trim().replace(/[^A-Z0-9.-]/g, "").slice(0, 15);
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<SymbolSearchItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    onOpenChange(false);
  }, [onOpenChange, pathname]);

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setSymbols([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await searchSymbols(query, controller.signal);
        setSymbols(response.items);
      } catch (reason) {
        if ((reason as Error).name !== "AbortError") setSymbols([]);
      } finally {
        setLoading(false);
      }
    }, 170);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [open, query]);

  const filteredRoutes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return routes.filter((item) => item.available).slice(0, 5);
    return routes.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(normalized)).slice(0, 6);
  }, [query]);

  const directTicker = normalizeTicker(query);
  const canOpenTicker = /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(directTicker);

  const navigate = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="command-overlay" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Recherche Anatole" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-input-row">
          <Search size={19} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. MDA, Royal Bank, ETF, Terminal…"
            aria-label="Rechercher dans Anatole"
          />
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Fermer"><X size={18} /></button>
        </div>

        <div className="command-results">
          {canOpenTicker ? (
            <button className="command-result command-direct" type="button" onClick={() => navigate(`/focus/${directTicker}`)}>
              <span className="command-result-icon"><BarChart3 size={18} /></span>
              <span><strong>Ouvrir {directTicker} dans Focus</strong><small>Recherche directe sur le symbole saisi</small></span>
              <kbd>Entrée</kbd>
            </button>
          ) : null}

          {symbols.length > 0 ? <p className="command-group-label">Titres du TSX 60</p> : null}
          {symbols.map((item) => (
            <button key={item.symbol} className="command-result" type="button" onClick={() => navigate(`/focus/${item.symbol}`)}>
              <span className="command-symbol">{item.symbol}</span>
              <span><strong>{item.name}</strong><small>{item.sector} · {item.exchange}</small></span>
            </button>
          ))}

          {filteredRoutes.length > 0 ? <p className="command-group-label">Sections</p> : null}
          {filteredRoutes.map(({ label, description, href, icon: Icon, available }) => (
            <button key={label} className="command-result" type="button" onClick={() => navigate(href)}>
              <span className="command-result-icon"><Icon size={18} /></span>
              <span><strong>{label}</strong><small>{description}</small></span>
              {!available ? <em>Préparation</em> : null}
            </button>
          ))}

          {loading ? <div className="command-message">Recherche des titres…</div> : null}
          {!loading && query && symbols.length === 0 && filteredRoutes.length === 0 && !canOpenTicker ? (
            <div className="command-message">Aucun résultat. Essaie un symbole comme MDA, RY ou SHOP.</div>
          ) : null}
        </div>
        <footer className="command-footer"><span>↑↓ naviguer</span><span>Échap fermer</span><span>Ctrl K ouvrir</span></footer>
      </section>
    </div>
  );
}
