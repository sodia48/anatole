"use client";

import { FocusWorkspace } from "@/components/focus-pro/FocusWorkspace";
import type { FocusSnapshot } from "@/lib/types";
import type { ReactNode } from "react";

/**
 * Stable route-level boundary. Focus Pro owns workstation state and features;
 * the page contract remains the existing server-provided Focus snapshot.
 */
export function FocusClient({
  initialSnapshot,
  initialFundamentalView,
  initialDiagnosticSection,
  portal,
}: {
  initialSnapshot: FocusSnapshot;
  initialFundamentalView?: "diagnostic" | "peers" | "scenarios" | "documents" | "capital" | "financials" | "analysts";
  initialDiagnosticSection?: "sector";
  portal: ReactNode;
}) {
  return <FocusWorkspace key={`${initialFundamentalView ?? "overview"}-${initialDiagnosticSection ?? "default"}`} initialSnapshot={initialSnapshot} initialFundamentalView={initialFundamentalView} initialDiagnosticSection={initialDiagnosticSection} portal={portal} />;
}
