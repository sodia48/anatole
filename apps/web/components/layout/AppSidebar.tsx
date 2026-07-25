"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import guardStyles from "./AppSidebarGuard.module.css";
import {
  useEffect,
  useMemo,
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

function mobileSectionFromPath(
  pathname: string,
): string {
  if (pathname.startsWith("/focus")) {
    return "focus";
  }

  if (pathname.startsWith("/etf")) {
    return "etf";
  }

  if (
    pathname === "/ipo-insiders" ||
    pathname.startsWith("/ipo") ||
    pathname.startsWith("/insiders")
  ) {
    return "ipo-insiders";
  }

  const firstSegment = pathname
    .split("/")
    .filter(Boolean)[0];

  return firstSegment || "cockpit";
}

function openSearchFallback(): void {
  window.dispatchEvent(
    new CustomEvent("anatole:open-search"),
  );

  const candidate =
    document.querySelector<HTMLInputElement>(
      'input[placeholder*="Rechercher"], input[type="search"]',
    );

  candidate?.focus();
}

export function AppSidebar({
  onOpenSearch,
}: {
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const mobileSection = useMemo(
    () => mobileSectionFromPath(pathname),
    [pathname],
  );

  const activeLabel = useMemo(() => {
    for (const group of groups) {
      const active = group.items.find(
        (item) =>
          isActive(pathname, item),
      );

      if (active) {
        return active.label;
      }
    }

    return "Anatole";
  }, [pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.dataset.anatoleSection =
      mobileSection;
    document.body.dataset.anatolePath =
      pathname;

    return () => {
      if (
        document.body.dataset
          .anatolePath === pathname
      ) {
        delete document.body.dataset
          .anatoleSection;
        delete document.body.dataset
          .anatolePath;
      }
    };
  }, [mobileSection, pathname]);

  useEffect(() => {
    document.body.classList.toggle(
      "anatole-drawer-open",
      drawerOpen,
    );

    return () => {
      document.body.classList.remove(
        "anatole-drawer-open",
      );
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
  }, [drawerOpen]);

  function openSearch(): void {
    setDrawerOpen(false);

    if (onOpenSearch) {
      onOpenSearch();
      return;
    }

    window.setTimeout(
      openSearchFallback,
      50,
    );
  }

  return (
    <>
      <header
        className={`mobile-appbar ${guardStyles.mobileAppbar}`}
      >
        <button
          type="button"
          className="mobile-appbar-button"
          aria-label="Ouvrir le menu Anatole"
          aria-controls="anatole-sidebar"
          aria-expanded={drawerOpen}
          onClick={() =>
            setDrawerOpen(true)
          }
        >
          <Menu size={21} />
        </button>

        <Link
          href="/cockpit"
          className="mobile-appbar-brand"
          aria-label="Accueil Anatole"
        >
          <span className="mobile-brand-mark">
            A
          </span>
          <span>
            <strong>anatole</strong>
            <small>{activeLabel}</small>
          </span>
        </Link>

        <button
          type="button"
          className="mobile-appbar-button"
          aria-label="Rechercher dans Anatole"
          onClick={openSearch}
        >
          <Search size={20} />
        </button>
      </header>

      <button
        type="button"
        className={`mobile-sidebar-backdrop ${guardStyles.mobileBackdrop}`}
        aria-label="Fermer le menu"
        hidden={!drawerOpen}
        onClick={() =>
          setDrawerOpen(false)
        }
      />

      <aside
        id="anatole-sidebar"
        className={`sidebar ${
          drawerOpen
            ? "is-mobile-open"
            : ""
        }`}
      >
        <div
          className={`mobile-drawer-heading ${guardStyles.mobileDrawerHeading}`}
        >
          <Link
            href="/cockpit"
            className="mobile-drawer-brand"
            onClick={() =>
              setDrawerOpen(false)
            }
          >
            <span className="brand-mark">
              A
            </span>
            <span>
              <strong>anatole</strong>
              <small>
                Intelligence de marché
              </small>
            </span>
          </Link>

          <button
            type="button"
            className="mobile-drawer-close"
            aria-label="Fermer le menu Anatole"
            onClick={() =>
              setDrawerOpen(false)
            }
          >
            <X size={21} />
          </button>
        </div>

        <Link
          href="/cockpit"
          className="brand desktop-brand"
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
            <section
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
                        setDrawerOpen(
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
                        <em>
                          Bientôt
                        </em>
                      ) : null}
                    </Link>
                  );
                },
              )}
            </section>
          ))}
        </nav>

        <nav
          className="mobile-nav"
          aria-hidden="true"
        />

        <div className="sidebar-footer">
          <Link href="/roadmap">
            Migration Anatole v0.5
          </Link>
          <span>
            Next.js · FastAPI
          </span>
        </div>
      </aside>
    </>
  );
}
