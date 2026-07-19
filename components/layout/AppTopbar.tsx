"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings2 } from "lucide-react";
import { ApiStatus } from "@/components/status/ApiStatus";

const titles: Array<[string, string]> = [
  ["/cockpit", "Cockpit TSX 60"],
  ["/focus", "Focus"],
  ["/watchlist", "Watchlist"],
  ["/preferences", "Préférences"],
  ["/roadmap", "Migration Anatole"],
];

export function AppTopbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const pathname = usePathname();
  const title = titles.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Anatole";

  return (
    <header className="app-topbar">
      <div className="topbar-context">
        <span className="topbar-product">ANATOLE</span>
        <strong>{title}</strong>
      </div>
      <div className="topbar-actions">
        <ApiStatus />
        <span className="universe-pill">TSX 60</span>
        <button className="search-trigger" type="button" onClick={onOpenSearch}>
          <Search size={17} />
          <span>Rechercher un titre ou une section</span>
          <kbd>Ctrl K</kbd>
        </button>
        <Link href="/preferences" className="topbar-icon-button" aria-label="Préférences">
          <Settings2 size={18} />
        </Link>
      </div>
    </header>
  );
}
