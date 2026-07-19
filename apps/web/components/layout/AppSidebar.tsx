"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, BookOpen, LayoutDashboard, Search, Star } from "lucide-react";

const items = [
  { href: "/cockpit", label: "Cockpit", icon: LayoutDashboard },
  { href: "/focus/RY", label: "Focus", icon: BarChart3 },
  { href: "/focus/SHOP", label: "Screener bientôt", icon: Search },
  { href: "/focus/ENB", label: "Liste bientôt", icon: Star },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/cockpit" className="brand" aria-label="Anatole">
        <span className="brand-mark">A</span>
        <span>anatole</span>
      </Link>
      <nav className="sidebar-nav" aria-label="Navigation principale">
        {items.map(({ href, label, icon: Icon }) => {
          const active = label === "Cockpit"
            ? pathname === "/cockpit"
            : label === "Focus"
              ? pathname.startsWith("/focus")
              : pathname === href;
          return (
            <Link key={label} href={href} className={`nav-item ${active ? "is-active" : ""}`}>
              <Icon size={19} /><span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
        <button className="icon-button" aria-label="Documentation"><BookOpen size={18} /></button>
      </div>
    </aside>
  );
}
