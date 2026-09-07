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
import "./theme.css";

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
  colorScheme: "dark light",
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
            __html: `try{var r=document.documentElement,p=JSON.parse(localStorage.getItem("anatole.preferences.v0.4")||"{}");r.dataset.sidebarState=localStorage.getItem("anatole-sidebar-collapsed")==="true"?"collapsed":"expanded";r.dataset.theme=p.theme==="blue"?"blue":"dark";r.dataset.density=p.density==="compact"?"compact":"comfortable";r.dataset.language=p.language==="en"?"en":"fr";r.lang=p.language==="en"?"en-CA":"fr-CA";r.style.colorScheme=p.theme==="blue"?"light":"dark";var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.content=p.theme==="blue"?"#DDF3FF":"#050D15"}catch(e){document.documentElement.dataset.sidebarState="expanded"}`,
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
