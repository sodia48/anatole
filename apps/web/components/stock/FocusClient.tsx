"use client";

import { FocusWorkspace } from "@/components/focus-pro/FocusWorkspace";
import type { FocusSnapshot } from "@/lib/types";

/**
 * Stable route-level boundary. Focus Pro owns workstation state and features;
 * the page contract remains the existing server-provided Focus snapshot.
 */
export function FocusClient({
  initialSnapshot,
  initialFundamentalView,
  initialDiagnosticSection,
}: {
  initialSnapshot: FocusSnapshot;
  initialFundamentalView?: "diagnostic" | "peers" | "scenarios" | "documents" | "capital" | "financials" | "analysts";
  initialDiagnosticSection?: "sector";
}) {
  return <FocusWorkspace key={`${initialFundamentalView ?? "overview"}-${initialDiagnosticSection ?? "default"}`} initialSnapshot={initialSnapshot} initialFundamentalView={initialFundamentalView} initialDiagnosticSection={initialDiagnosticSection} />;
}
