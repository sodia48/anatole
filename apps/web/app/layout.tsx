import type { Metadata } from "next";
import { AppSidebar } from "@/components/layout/AppSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anatole",
  description: "Plateforme d’analyse du marché canadien.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <div className="app-shell">
          <AppSidebar />
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
