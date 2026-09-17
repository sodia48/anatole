"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

let warmupQueue: Promise<void> = Promise.resolve();

function backgroundWarmupAllowed(): boolean {
  if (document.visibilityState === "hidden") return false;

  const connection = (
    navigator as Navigator & { connection?: ConnectionInfo }
  ).connection;

  if (connection?.saveData) return false;
  return !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

function scaledWarmupDelay(delayMs: number): number {
  const connection = (
    navigator as Navigator & { connection?: ConnectionInfo }
  ).connection;
  if (connection?.effectiveType === "3g") return Math.round(delayMs * 1.5);
  return delayMs;
}

function scheduleWarmup(
  delayMs: number,
  operation: () => Promise<unknown>[],
): number {
  return window.setTimeout(() => {
    warmupQueue = warmupQueue
      .catch(() => undefined)
      .then(async () => {
        if (!backgroundWarmupAllowed()) return;
        await Promise.allSettled(operation());
      });
  }, scaledWarmupDelay(delayMs));
}

export function WebPerformanceWarmup() {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const language = preferences.language;

  useEffect(() => {
    if (!backgroundWarmupAllowed()) return;

    const sessionKey = `anatole:warmup:v3iz:${language}`;
    try {
      if (window.sessionStorage.getItem(sessionKey) === "1") return;
      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      // The performance warmup remains optional when storage is unavailable.
    }

    const today = pathname === "/aujourdhui";
    const cockpit = pathname === "/cockpit";
    const terminal = pathname === "/terminal";
    const psychology = pathname === "/psychologie";
    const news = pathname === "/actualites";
    const calendar = pathname === "/calendrier";
    const screener = pathname === "/screener";
    const etf = pathname === "/etf" || pathname.startsWith("/etf/");

    const timers: number[] = [];

    // Never duplicate Today's own initial fan-out. On other pages, warm
    // only destinations the user is not currently loading.
    if (!today) {
      timers.push(
        scheduleWarmup(900, () => [
          ...(cockpit ? [] : [getCockpitSnapshot("composite")]),
          ...(psychology ? [] : [getPsychologySnapshot()]),
        ]),
      );

      timers.push(
        scheduleWarmup(2_000, () => [
          ...(news ? [] : [getNewsSnapshot(language)]),
          ...(calendar ? [] : [getCalendarSnapshot(language)]),
        ]),
      );

      timers.push(
        scheduleWarmup(3_500, () => [
          ...(terminal ? [] : [getTerminalSnapshot()]),
          ...(cockpit ? [] : [getCockpitSnapshot("tsx60")]),
        ]),
      );
    }

    // Expensive discovery sections are deliberately delayed. This removes
    // competition with the first meaningful paint while preserving fast
    // navigation later in the session.
    timers.push(
      scheduleWarmup(today ? 3_500 : 6_000, () => [
        ...(screener ? [] : [getScreenerSnapshot("composite")]),
        getEarningsCalendarSnapshot("composite"),
        ...(etf ? [] : [getEtfDirectory()]),
      ]),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [language, pathname]);

  return null;
}
