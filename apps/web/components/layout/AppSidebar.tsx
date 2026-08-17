"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
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
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  TableProperties,
  UserRound,
  X,
} from "lucide-react";

import guardStyles from "./AppSidebarGuard.module.css";
import { AccountStatus } from "@/components/account/AccountStatus";
import { useAccount } from "@/components/providers/AccountProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { navLabel, pick } from "@/lib/i18n";
import { ANATOLE_VERSION_LABEL } from "@/lib/version";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  available: boolean;
  adminOnly?: boolean;
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
        href: "/aujourdhui",
        label: "Aujourd’hui",
        icon: LayoutDashboard,
        available: true,
      },
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
        href: "/comparateur",
        label: "Comparateur",
        icon: GitCompareArrows,
        available: true,
      },
      {
        href: "/psychologie",
        label: "Psychologie",
        icon: Activity,
        available: true,
      },
      {
        href: "/terminal",
        label: "Terminal Pro",
        icon: Gauge,
        available: true,
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
        href: "/portefeuille",
        label: "Portefeuille",
        icon: BriefcaseBusiness,
        available: true,
      },
      {
        href: "/alertes",
        label: "Alertes",
        icon: Bell,
        available: true,
      },
      {
        href: "/notifications",
        label: "Notifications",
        icon: Bell,
        available: true,
      },
      {
        href: "/parametres",
        label: "Compte & paramètres",
        icon: Settings2,
        available: true,
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        href: "/assistant",
        label: "Anatole Conseil",
        icon: Bot,
        available: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin",
        label: "Console bêta",
        icon: ShieldCheck,
        available: true,
        adminOnly: true,
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

function comparisonSymbolsFromQuery(
  value: string,
): string[] {
  const hasComparisonIntent =
    /(?:comparer|compare|comparaison|\bvs\b|\bversus\b|,|\+|;|\/|\|)/i.test(value);

  if (!hasComparisonIntent) {
    return [];
  }

  const normalized = value
    .toUpperCase()
    .replace(/COMPARER|COMPARE|COMPARAISON/g, " ")
    .replace(/\.TO/g, "")
    .replace(/\b(?:AVEC|ET|VS|VERSUS)\b/g, ",")
    .replace(/[+;/|]/g, ",");

  const symbols = normalized
    .split(/[\s,]+/)
    .map((item) => item.replace(/[^A-Z0-9.^-]/g, ""))
    .filter((item) => /^[A-Z0-9][A-Z0-9.^-]{0,14}$/.test(item));

  return [...new Set(symbols)].slice(0, 5);
}

export function AppSidebar({
  onOpenSearch,
}: {
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAccount();
  const { preferences } = usePreferences();
  const language = preferences.language;
  const localizedGroups = useMemo(
    () => groups.map((group) => ({
      ...group,
      label: navLabel(language, group.label),
      items: group.items.map((item) => ({
        ...item,
        label: navLabel(language, item.label),
      })),
    })),
    [language],
  );
  const searchablePages = useMemo<SearchResult[]>(
    () => localizedGroups.flatMap((group) =>
      group.items
        .filter((item) => item.available && !item.adminOnly)
        .map((item) => ({
          key: `page:${item.href}`,
          href: item.href,
          label: item.label,
          description: group.label,
          icon: item.icon,
        })),
    ),
    [localizedGroups],
  );
  const searchInputRef =
    useRef<HTMLInputElement | null>(null);
  const [drawerOpen, setDrawerOpen] =
    useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] =
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
    for (const group of localizedGroups) {
      const active = group.items.find(
        (item) => isActive(pathname, item),
      );

      if (active) {
        return active.label;
      }
    }

    return "Anatole";
  }, [localizedGroups, pathname]);

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
            label: pick(language, `Analyser ${ticker}`, `Analyze ${ticker}`),
            description: pick(language, "Ouvrir la fiche Focus", "Open Focus view"),
            icon: BarChart3,
          },
        ]
      : [];
    const comparisonSymbols =
      comparisonSymbolsFromQuery(searchQuery);
    const comparisonResult: SearchResult[] =
      comparisonSymbols.length >= 2
        ? [
            {
              key: `compare:${comparisonSymbols.join(":")}`,
              href: `/comparateur?symbols=${encodeURIComponent(
                comparisonSymbols.join(","),
              )}`,
              label: pick(language, `Comparer ${comparisonSymbols.join(" · ")}`, `Compare ${comparisonSymbols.join(" · ")}`),
              description: pick(language, "Ouvrir le Comparateur", "Open Comparator"),
              icon: GitCompareArrows,
            },
          ]
        : [];

    return [
      ...comparisonResult,
      ...directResult,
      ...pages,
    ].slice(0, 12);
  }, [language, searchQuery, searchablePages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDrawerOpen(false);
      setSearchOpen(false);
      setSearchQuery("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const collapsed =
          document.documentElement.dataset.sidebarState === "collapsed" ||
          window.localStorage.getItem("anatole-sidebar-collapsed") === "true";
        setSidebarCollapsed(collapsed);
        document.documentElement.dataset.sidebarState = collapsed
          ? "collapsed"
          : "expanded";
      } catch {
        document.documentElement.dataset.sidebarState = "expanded";
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleDesktopSidebar(): void {
    setSidebarCollapsed((current) => {
      const next = !current;

      document.documentElement.dataset
        .sidebarState = next
          ? "collapsed"
          : "expanded";

      try {
        window.localStorage.setItem(
          "anatole-sidebar-collapsed",
          String(next),
        );
      } catch {
        // La navigation reste utilisable si le stockage est bloqué.
      }

      return next;
    });
  }

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
    const timer = window.setTimeout(() => setActiveResult(0), 0);
    return () => window.clearTimeout(timer);
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
          aria-label={pick(language, "Ouvrir le menu Anatole", "Open Anatole menu")}
          aria-controls="anatole-sidebar"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={21} />
        </button>

        <Link
          href="/aujourdhui"
          className="mobile-appbar-brand"
          aria-label={pick(language, "Accueil Anatole", "Anatole home")}
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
          aria-label={pick(language, "Rechercher dans Anatole", "Search Anatole")}
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          onClick={openSearch}
          title={
            sidebarCollapsed
              ? pick(language, "Rechercher", "Search")
              : undefined
          }
        >
          <Search size={20} />
        </button>
      </header>

      <button
        type="button"
        className={`mobile-sidebar-backdrop ${guardStyles.mobileBackdrop}`}
        aria-label={pick(language, "Fermer le menu", "Close menu")}
        hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />

      {searchOpen ? (
        <div
          className={guardStyles.searchBackdrop}
          role="presentation"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
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
                <span>{pick(language, "RECHERCHE ANATOLE", "ANATOLE SEARCH")}</span>
                <h2 id="anatole-search-title">
                  {pick(language, "Trouver une section ou un titre", "Find a section or security")}
                </h2>
              </div>
              <button
                type="button"
                className={guardStyles.searchClose}
                aria-label={pick(language, "Fermer la recherche", "Close search")}
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
                placeholder={pick(language, "Ex. RY, SHOP, ETF, Psychologie…", "E.g. RY, SHOP, ETF, Psychology…")}
                autoComplete="off"
                spellCheck={false}
                onChange={(event: ReactChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(event.target.value)
                }
                onKeyDown={handleSearchKeyDown}
              />
              <kbd>Esc</kbd>
            </label>

            <div
              className={guardStyles.searchResults}
              role="listbox"
              aria-label={pick(language, "Résultats de recherche", "Search results")}
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
                  {pick(
                    language,
                    "Aucun résultat. Saisis un symbole TSX, par exemple RY ou SHOP.",
                    "No result. Enter a TSX symbol, for example RY or SHOP.",
                  )}
                </p>
              )}
            </div>

            <p className={guardStyles.searchHelp}>
              {pick(
                language,
                "↑↓ pour naviguer · Entrée pour ouvrir · Ctrl/⌘ K pour rechercher",
                "↑↓ to navigate · Enter to open · Ctrl/⌘ K to search",
              )}
            </p>
          </section>
        </div>
      ) : null}

      <aside
        id="anatole-sidebar"
        className={`sidebar ${
          sidebarCollapsed
            ? "is-desktop-collapsed"
            : ""
        } ${
          drawerOpen ? "is-mobile-open" : ""
        }`}
      >
        <div
          className={`mobile-drawer-heading ${guardStyles.mobileDrawerHeading}`}
        >
          <Link
            href="/aujourdhui"
            className="mobile-drawer-brand"
            onClick={() => setDrawerOpen(false)}
          >
            <span className="brand-mark">A</span>
            <span>
              <strong>anatole</strong>
              <small>{pick(language, "Intelligence de marché", "Market intelligence")}</small>
            </span>
          </Link>

          <button
            type="button"
            className="mobile-drawer-close"
            aria-label={pick(language, "Fermer le menu Anatole", "Close Anatole menu")}
            onClick={() => setDrawerOpen(false)}
          >
            <X size={21} />
          </button>
        </div>

        <div className="desktop-sidebar-header">
          <Link
            href="/aujourdhui"
            className="brand desktop-brand"
            aria-label="Anatole"
            title={
              sidebarCollapsed
                ? pick(language, "Accueil Anatole", "Anatole home")
                : undefined
            }
          >
            <span className="brand-mark">A</span>
            <span>anatole</span>
            <small>beta</small>
          </Link>
        </div>

        <button
          type="button"
          className="desktop-sidebar-edge-toggle"
          aria-label={
            sidebarCollapsed
              ? pick(language, "Déplier la navigation", "Expand navigation")
              : pick(language, "Replier la navigation", "Collapse navigation")
          }
          aria-controls="anatole-sidebar"
          aria-pressed={sidebarCollapsed}
          title={
            sidebarCollapsed
              ? pick(language, "Déplier le menu", "Expand menu")
              : pick(language, "Replier le menu", "Collapse menu")
          }
          onClick={toggleDesktopSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={19} />
          ) : (
            <PanelLeftClose size={19} />
          )}
        </button>

        <button
          className="sidebar-search"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          onClick={openSearch}
        >
          <Search size={17} />
          <span>{pick(language, "Rechercher", "Search")}</span>
          <kbd>⌘K</kbd>
        </button>

        <Link
          href="/parametres?section=account"
          className={`sidebar-account-shortcut ${
            pathname.startsWith("/parametres") ? "is-active" : ""
          }`}
          aria-current={pathname.startsWith("/parametres") ? "page" : undefined}
          onClick={() => setDrawerOpen(false)}
          title={
            sidebarCollapsed
              ? pick(language, "Compte & paramètres", "Account & settings")
              : undefined
          }
        >
          <UserRound size={19} />
          <span>
            <strong>{pick(language, "Compte & paramètres", "Account & settings")}</strong>
            <small>{pick(language, "Compte · préférences · données", "Account · preferences · data")}</small>
          </span>
        </Link>

        <nav
          className="sidebar-nav desktop-nav"
          aria-label={pick(language, "Navigation principale", "Main navigation")}
        >
          {localizedGroups
            .filter((group) =>
              group.items.some(
                (item) => !item.adminOnly || user?.is_admin,
              ),
            )
            .map((group) => (
            <section
              className="nav-group"
              key={group.label}
            >
              <span className="nav-group-label">
                {group.label}
              </span>

              {group.items
                .filter((item) => !item.adminOnly || user?.is_admin)
                .map((item) => {
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
                    title={
                      sidebarCollapsed
                        ? item.label
                        : undefined
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
                      <em>{pick(language, "Bientôt", "Soon")}</em>
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
          <AccountStatus />
          <Link href="/roadmap">
            Anatole {ANATOLE_VERSION_LABEL}
          </Link>
          <span>{pick(language, "Centre de contrôle · synchronisation active", "Control center · synchronization active")}</span>
        </div>
      </aside>

      <nav
        className={`mobile-bottom-nav ${guardStyles.mobileBottomNav}`}
        aria-label={pick(language, "Accès rapide Anatole", "Anatole quick access")}
      >
        <Link
          href="/aujourdhui"
          className={pathname === "/aujourdhui" ? "is-active" : ""}
          aria-current={pathname === "/aujourdhui" ? "page" : undefined}
        >
          <LayoutDashboard size={20} />
          <span>{pick(language, "Aujourd’hui", "Today")}</span>
        </Link>
        <Link
          href="/cockpit"
          className={pathname === "/cockpit" ? "is-active" : ""}
          aria-current={pathname === "/cockpit" ? "page" : undefined}
        >
          <Activity size={20} />
          <span>Cockpit</span>
        </Link>
        <Link
          href="/screener"
          className={pathname === "/screener" ? "is-active" : ""}
          aria-current={pathname === "/screener" ? "page" : undefined}
        >
          <TableProperties size={20} />
          <span>Screener</span>
        </Link>
        <Link
          href="/etf"
          className={pathname.startsWith("/etf") ? "is-active" : ""}
          aria-current={pathname.startsWith("/etf") ? "page" : undefined}
        >
          <CircleDollarSign size={20} />
          <span>ETF</span>
        </Link>
        <button
          type="button"
          className={
            pathname !== "/aujourdhui" &&
            pathname !== "/cockpit" &&
            pathname !== "/screener" &&
            !pathname.startsWith("/etf")
              ? "is-active"
              : ""
          }
          aria-label={pick(language, "Ouvrir toutes les sections", "Open all sections")}
          aria-controls="anatole-sidebar"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}
