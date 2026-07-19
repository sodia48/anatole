import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Anatole",
    template: "%s · Anatole",
  },
  description: "Plateforme d’analyse du marché canadien.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-theme="dark" data-density="comfortable" suppressHydrationWarning>
      <body>
        <PreferencesProvider>
          <AppShell>{children}</AppShell>
        </PreferencesProvider>
      </body>
    </html>
  );
}
