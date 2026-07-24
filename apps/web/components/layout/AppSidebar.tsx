"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  Database,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  Newspaper,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  TableProperties,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  available: boolean;
  mobile?: boolean;
};

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Marchés",
    items: [
      { href: "/cockpit", label: "Cockpit", icon: LayoutDashboard, available: true, mobile: true },
      { href: "/screener", label: "Screener", icon: TableProperties, available: true, mobile: true },
      { href: "/actualites", label: "Actualités", icon: Newspaper, available: true },
      { href: "/calendrier", label: "Calendrier", icon: CalendarDays, available: true },
      { href: "/etf", label: "ETF", icon: CircleDollarSign, available: true },
      { href: "/ipo-insiders", label: "IPO & insiders", icon: Database, available: true, mobile: true },
    ],
  },
  {
    label: "Analyse",
    items: [
      { href: "/focus/RY", label: "Focus", icon: BarChart3, available: true, mobile: true },
      { href: "/roadmap#comparateur", label: "Comparateur", icon: GitCompareArrows, available: false },
      { href: "/psychologie", label: "Psychologie", icon: Activity, available: true },
      { href: "/roadmap#terminal", label: "Terminal Pro", icon: Gauge, available: false },
    ],
  },
  {
    label: "Mon espace",
    items: [
      { href: "/watchlist", label: "Watchlist", icon: Star, available: true, mobile: true },
      { href: "/roadmap#portefeuille", label: "Portefeuille", icon: BriefcaseBusiness, available: false },
      { href: "/roadmap#alertes", label: "Alertes", icon: Bell, available: false },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/roadmap#assistant", label: "Assistant", icon: Bot, available: false },
      { href: "/roadmap#qualite", label: "Qualité des données", icon: ShieldCheck, available: false },
      { href: "/preferences", label: "Préférences", icon: Settings2, available: true, mobile: true },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (!item.available) return pathname === "/roadmap" && item.href.startsWith("/roadmap");
  if (item.href.startsWith("/focus")) return pathname.startsWith("/focus");
  return pathname === item.href;
}

export function AppSidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const pathname = usePathname();
  const mobileItems = groups.flatMap((group) => group.items).filter((item) => item.mobile);

  return (
    <aside className="sidebar">
      <Link href="/cockpit" className="brand" aria-label="Anatole">
        <span className="brand-mark">A</span>
        <span>anatole</span>
        <small>beta</small>
      </Link>

      <button className="sidebar-search" type="button" onClick={onOpenSearch}>
        <Search size={17} /><span>Rechercher</span><kbd>⌘K</kbd>
      </button>

      <nav className="sidebar-nav desktop-nav" aria-label="Navigation principale">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`nav-item ${active ? "is-active" : ""} ${item.available ? "" : "is-planned"}`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {!item.available ? <em>Bientôt</em> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link key={item.label} href={item.href} className={`mobile-nav-item ${active ? "is-active" : ""}`}>
              <Icon size={19} /><span>{item.label}</span>
            </Link>
          );
        })}
        <button className="mobile-nav-item" type="button" onClick={onOpenSearch}>
          <Search size={19} /><span>Recherche</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <Link href="/roadmap">Migration v0.5</Link>
        <span>Next.js + FastAPI</span>
      </div>
    </aside>
  );
}
