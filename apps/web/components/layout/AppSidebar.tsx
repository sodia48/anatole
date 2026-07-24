"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";
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
  Menu,
  Newspaper,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  TableProperties,
  X,
} from "lucide-react";

import { MobileDesktopParity } from "./MobileDesktopParity";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  available: boolean;
};

const groups: Array<{
  label: string;
  items: NavItem[];
}> = [
  {
    label: "Marchés",
    items: [
      {
        href: "/cockpit",
        label: "Cockpit",
        icon: LayoutDashboard,
        available: true,
      },
      {
        href: "/screener",
        label: "Screener",
        icon: TableProperties,
        available: true,
      },
      {
        href: "/actualites",
        label: "Actualités",
        icon: Newspaper,
        available: true,
      },
      {
        href: "/calendrier",
        label: "Calendrier",
        icon: CalendarDays,
        available: true,
      },
      {
        href: "/etf",
        label: "ETF",
        icon: CircleDollarSign,
        available: true,
      },
      {
        href: "/ipo-insiders",
        label: "IPO & insiders",
        icon: Database,
        available: true,
      },
    ],
  },
  {
    label: "Analyse",
    items: [
      {
        href: "/focus/RY",
        label: "Focus",
        icon: BarChart3,
        available: true,
      },
      {
        href: "/roadmap#comparateur",
        label: "Comparateur",
        icon: GitCompareArrows,
        available: false,
      },
      {
        href: "/psychologie",
        label: "Psychologie",
        icon: Activity,
        available: true,
      },
      {
        href: "/roadmap#terminal",
        label: "Terminal Pro",
        icon: Gauge,
        available: false,
      },
    ],
  },
  {
    label: "Mon espace",
    items: [
      {
        href: "/watchlist",
        label: "Watchlist",
        icon: Star,
        available: true,
      },
      {
        href: "/roadmap#portefeuille",
        label: "Portefeuille",
        icon: BriefcaseBusiness,
        available: false,
      },
      {
        href: "/roadmap#alertes",
        label: "Alertes",
        icon: Bell,
        available: false,
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        href: "/roadmap#assistant",
        label: "Assistant",
        icon: Bot,
        available: false,
      },
      {
        href: "/roadmap#qualite",
        label: "Qualité des données",
        icon: ShieldCheck,
        available: false,
      },
      {
        href: "/preferences",
        label: "Préférences",
        icon: Settings2,
        available: true,
      },
    ],
  },
];

function isActive(
  pathname: string,
  item: NavItem,
): boolean {
  if (!item.available) {
    return (
      pathname === "/roadmap" &&
      item.href.startsWith("/roadmap")
    );
  }

  if (item.href.startsWith("/focus")) {
    return pathname.startsWith("/focus");
  }

  if (item.href === "/ipo-insiders") {
    return (
      pathname === "/ipo-insiders" ||
      pathname === "/ipo" ||
      pathname === "/insiders"
    );
  }

  return pathname === item.href;
}

export function AppSidebar({
  onOpenSearch = () => undefined,
}: {
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] =
    useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
    };
  }, [mobileOpen]);

  function openSearch(): void {
    setMobileOpen(false);
    onOpenSearch();
  }

  return (
    <>
      <MobileDesktopParity />

      <button
        type="button"
        className={`mobile-menu-toggle ${
          mobileOpen
            ? "is-drawer-open"
            : ""
        }`}
        aria-label="Ouvrir le menu Anatole"
        aria-controls="anatole-sidebar"
        aria-expanded={mobileOpen}
        onClick={() =>
          setMobileOpen(true)
        }
      >
        <Menu size={22} />
      </button>

      <button
        type="button"
        className="mobile-sidebar-backdrop"
        aria-label="Fermer le menu"
        hidden={!mobileOpen}
        onClick={() =>
          setMobileOpen(false)
        }
      />

      <aside
        id="anatole-sidebar"
        className={`sidebar ${
          mobileOpen
            ? "is-mobile-open"
            : ""
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="mobile-sidebar-header">
          <Link
            href="/cockpit"
            className="brand"
            aria-label="Anatole"
            onClick={() =>
              setMobileOpen(false)
            }
          >
            <span className="brand-mark">
              A
            </span>
            <span>anatole</span>
            <small>beta</small>
          </Link>

          <button
            type="button"
            className="mobile-drawer-close"
            aria-label="Fermer le menu Anatole"
            onClick={() =>
              setMobileOpen(false)
            }
          >
            <X size={22} />
          </button>
        </div>

        <Link
          href="/cockpit"
          className="brand desktop-sidebar-brand"
          aria-label="Anatole"
        >
          <span className="brand-mark">
            A
          </span>
          <span>anatole</span>
          <small>beta</small>
        </Link>

        <button
          className="sidebar-search"
          type="button"
          onClick={openSearch}
        >
          <Search size={17} />
          <span>Rechercher</span>
          <kbd>⌘K</kbd>
        </button>

        <nav
          className="sidebar-nav desktop-nav"
          aria-label="Navigation principale"
        >
          {groups.map((group) => (
            <div
              className="nav-group"
              key={group.label}
            >
              <span className="nav-group-label">
                {group.label}
              </span>

              {group.items.map(
                (item) => {
                  const Icon =
                    item.icon;
                  const active =
                    isActive(
                      pathname,
                      item,
                    );

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() =>
                        setMobileOpen(
                          false,
                        )
                      }
                      className={`nav-item ${
                        active
                          ? "is-active"
                          : ""
                      } ${
                        item.available
                          ? ""
                          : "is-planned"
                      }`}
                    >
                      <Icon size={18} />
                      <span>
                        {item.label}
                      </span>
                      {!item.available ? (
                        <em>Bientôt</em>
                      ) : null}
                    </Link>
                  );
                },
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <Link
            href="/roadmap"
            onClick={() =>
              setMobileOpen(false)
            }
          >
            Migration v0.5
          </Link>
          <span>
            Next.js + FastAPI
          </span>
        </div>
      </aside>
    </>
  );
}
