"use client";

import { useEffect } from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  getCalendarSnapshot,
  getCockpitSnapshot,
  getEarningsCalendarSnapshot,
  getEtfDirectory,
  getNewsSnapshot,
  getPsychologySnapshot,
  getScreenerSnapshot,
  getTerminalSnapshot,
} from "@/lib/api";

function settle(promises: Promise<unknown>[]): void {
  void Promise.allSettled(promises);
}

export function WebPerformanceWarmup() {
  const { preferences } = usePreferences();
  const language = preferences.language;

  useEffect(() => {
    const timers = [
      window.setTimeout(() => {
        settle([
          getCockpitSnapshot("composite"),
          getPsychologySnapshot(),
        ]);
      }, 0),

      window.setTimeout(() => {
        settle([
          getNewsSnapshot(language),
          getCalendarSnapshot(language),
        ]);
      }, 250),

      window.setTimeout(() => {
        settle([
          getTerminalSnapshot(),
          getCockpitSnapshot("tsx60"),
        ]);
      }, 700),

      window.setTimeout(() => {
        settle([
          getScreenerSnapshot("composite"),
          getEarningsCalendarSnapshot("composite"),
          getEtfDirectory(),
        ]);
      }, 1_500),
    ];

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [language]);

  return null;
}
