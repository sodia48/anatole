import type {
  Metadata,
  Viewport,
} from "next";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { FeedbackButton } from "@/components/reliability/FeedbackButton";
import { ReliabilityNotice } from "@/components/reliability/ReliabilityNotice";
import { ANATOLE_VERSION } from "@/lib/version";
import { AppProviders } from "./providers";

import "./globals.css";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Anatole",
  description:
    "Plateforme d’analyse du marché canadien.",
  applicationName: "Anatole",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Anatole",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#050d15",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.sidebarState=localStorage.getItem("anatole-sidebar-collapsed")==="true"?"collapsed":"expanded"}catch(e){document.documentElement.dataset.sidebarState="expanded"}`,
          }}
        />
      </head>
      <body data-anatole-version={ANATOLE_VERSION}>
        <AppProviders>
          <div className="app-shell">
            <AppSidebar />
            <main className="app-main">
              {children}
            </main>
          </div>
          <ReliabilityNotice />
          <FeedbackButton />
        </AppProviders>
      </body>
    </html>
  );
}
