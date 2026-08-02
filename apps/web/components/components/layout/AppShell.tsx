"use client";

import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { CommandPalette } from "@/components/search/CommandPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="app-shell">
      <AppSidebar onOpenSearch={() => setSearchOpen(true)} />
      <div className="app-workspace">
        <AppTopbar onOpenSearch={() => setSearchOpen(true)} />
        <main className="app-main">{children}</main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
