"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
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

import guardStyles from "./AppSidebarGuard.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  available: boolean;
};

type SearchResult = {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
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

const searchablePages: SearchResult[] =
  groups.flatMap((group) =>
    group.items
      .filter((item) => item.available)
      .map((item) => ({
        key: `page:${item.href}`,
        href: item.href,
        label: item.label,
        description: group.label,
        icon: item.icon,
      })),
  );

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

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function tickerFromQuery(value: string): string | null {
  const ticker = value
    .trim()
    .toUpperCase()
    .replace(/\.TO$/i, "");

  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
    return null;
  }

  return ticker;
}

export function AppSidebar({
  onOpenSearch,
}: {
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef =
    useRef<HTMLInputElement | null>(null);
  const [drawerOpen, setDrawerOpen] =
    useState(false);
  const [searchOpen, setSearchOpen] =
    useState(false);
  const [searchQuery, setSearchQuery] =
    useState("");
  const [activeResult, setActiveResult] =
    useState(0);

  const mobileSection = useMemo(
    () => mobileSectionFromPath(pathname),
    [pathname],
  );

  const activeLabel = useMemo(() => {
    for (const group of groups) {
      const active = group.items.find(
        (item) => isActive(pathname, item),
      );

      if (active) {
        return active.label;
      }
    }

    return "Anatole";
  }, [pathname]);

  const searchResults = useMemo(() => {
    const normalizedQuery =
      normalizeSearch(searchQuery);

    const pages = normalizedQuery
      ? searchablePages.filter((item) =>
          normalizeSearch(
            `${item.label} ${item.description}`,
          ).includes(normalizedQuery),
        )
      : searchablePages;

    const ticker = tickerFromQuery(searchQuery);
    const directResult: SearchResult[] = ticker
      ? [
          {
            key: `ticker:${ticker}`,
            href: `/focus/${encodeURIComponent(
              ticker,
            )}`,
            label: `Analyser ${ticker}`,
            description: "Ouvrir la fiche Focus",
            icon: BarChart3,
          },
        ]
      : [];

    return [...directResult, ...pages].slice(0, 12);
  }, [searchQuery]);

  useEffect(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
  }, [pathname]);

  useEffect(() => {
    document.body.dataset.anatoleSection =
      mobileSection;
    document.body.dataset.anatolePath =
      pathname;

    return () => {
      if (
        document.body.dataset.anatolePath ===
        pathname
      ) {
        delete document.body.dataset
          .anatoleSection;
        delete document.body.dataset
          .anatolePath;
      }
    };
  }, [mobileSection, pathname]);

  useEffect(() => {
    const overlayOpen =
      drawerOpen || searchOpen;

    document.body.classList.toggle(
      "anatole-drawer-open",
      overlayOpen,
    );

    return () => {
      document.body.classList.remove(
        "anatole-drawer-open",
      );
    };
  }, [drawerOpen, searchOpen]);

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

  useEffect(() => {
    const openWithShortcut = (
      event: KeyboardEvent,
    ) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setDrawerOpen(false);
        setSearchOpen(true);
      }
    };

    window.addEventListener(
      "keydown",
      openWithShortcut,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        openWithShortcut,
      );
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(
      () => {
        searchInputRef.current?.focus();
      },
    );

    return () =>
      window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    setActiveResult(0);
  }, [searchQuery]);

  function openSearch(): void {
    setDrawerOpen(false);
    setSearchOpen(true);
    onOpenSearch?.();
  }

  function closeSearch(): void {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveResult(0);
  }

  function chooseResult(
    result: SearchResult,
  ): void {
    closeSearch();
    router.push(result.href);
  }

  function handleSearchKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResult((current) =>
        searchResults.length
          ? (current + 1) % searchResults.length
          : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResult((current) =>
        searchResults.length
          ? (current - 1 + searchResults.length) %
            searchResults.length
          : 0,
      );
      return;
    }

    if (event.key === "Enter") {
      const result = searchResults[activeResult];

      if (result) {
        event.preventDefault();
        chooseResult(result);
      }
    }
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
          onClick={() => setDrawerOpen(true)}
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
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
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
        onClick={() => setDrawerOpen(false)}
      />

      {searchOpen ? (
        <div
          className={guardStyles.searchBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSearch();
            }
          }}
        >
          <section
            className={guardStyles.searchDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="anatole-search-title"
          >
            <div className={guardStyles.searchHeader}>
              <div>
                <span>RECHERCHE ANATOLE</span>
                <h2 id="anatole-search-title">
                  Trouver une section ou un titre
                </h2>
              </div>
              <button
                type="button"
                className={guardStyles.searchClose}
                aria-label="Fermer la recherche"
                onClick={closeSearch}
              >
                <X size={20} />
              </button>
            </div>

            <label
              className={guardStyles.searchField}
            >
              <Search size={20} />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                placeholder="Ex. RY, SHOP, ETF, Psychologie…"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setSearchQuery(event.target.value)
                }
                onKeyDown={handleSearchKeyDown}
              />
              <kbd>Esc</kbd>
            </label>

            <div
              className={guardStyles.searchResults}
              role="listbox"
              aria-label="Résultats de recherche"
            >
              {searchResults.length ? (
                searchResults.map((result, index) => {
                  const Icon = result.icon;
                  const active =
                    index === activeResult;

                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`${guardStyles.searchResult} ${
                        active
                          ? guardStyles.searchResultActive
                          : ""
                      }`}
                      key={result.key}
                      onMouseEnter={() =>
                        setActiveResult(index)
                      }
                      onClick={() =>
                        chooseResult(result)
                      }
                    >
                      <span
                        className={
                          guardStyles.searchResultIcon
                        }
                      >
                        <Icon size={19} />
                      </span>
                      <span>
                        <strong>{result.label}</strong>
                        <small>
                          {result.description}
                        </small>
                      </span>
                      <span
                        className={
                          guardStyles.searchResultArrow
                        }
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className={guardStyles.searchEmpty}>
                  Aucun résultat. Saisis un symbole TSX,
                  par exemple RY ou SHOP.
                </p>
              )}
            </div>

            <p className={guardStyles.searchHelp}>
              ↑↓ pour naviguer · Entrée pour ouvrir ·
              Ctrl/⌘ K pour rechercher
            </p>
          </section>
        </div>
      ) : null}

      <aside
        id="anatole-sidebar"
        className={`sidebar ${
          drawerOpen ? "is-mobile-open" : ""
        }`}
      >
        <div
          className={`mobile-drawer-heading ${guardStyles.mobileDrawerHeading}`}
        >
          <Link
            href="/cockpit"
            className="mobile-drawer-brand"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="brand-mark">A</span>
            <span>
              <strong>anatole</strong>
              <small>Intelligence de marché</small>
            </span>
          </Link>

          <button
            type="button"
            className="mobile-drawer-close"
            aria-label="Fermer le menu Anatole"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={21} />
          </button>
        </div>

        <Link
          href="/cockpit"
          className="brand desktop-brand"
          aria-label="Anatole"
        >
          <span className="brand-mark">A</span>
          <span>anatole</span>
          <small>beta</small>
        </Link>

        <button
          className="sidebar-search"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
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

              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(
                  pathname,
                  item,
                );

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() =>
                      setDrawerOpen(false)
                    }
                    className={`nav-item ${
                      active ? "is-active" : ""
                    } ${
                      item.available
                        ? ""
                        : "is-planned"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {!item.available ? (
                      <em>Bientôt</em>
                    ) : null}
                  </Link>
                );
              })}
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
          <span>Next.js · FastAPI</span>
        </div>
      </aside>
    </>
  );
}
