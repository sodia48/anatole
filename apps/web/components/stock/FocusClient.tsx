"use client";

import { FocusWorkspace } from "@/components/focus-pro/FocusWorkspace";
import type { FocusSnapshot } from "@/lib/types";

/**
 * Stable route-level boundary. Focus Pro owns workstation state and features;
 * the page contract remains the existing server-provided Focus snapshot.
 */
export function FocusClient({
  initialSnapshot,
}: {
  initialSnapshot: FocusSnapshot;
}) {
  return <FocusWorkspace initialSnapshot={initialSnapshot} />;
}
