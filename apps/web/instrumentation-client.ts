import { reportClientEvent } from "./lib/reliability";

declare global {
  interface Window {
    __anatoleReliabilityInstrumentation?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__anatoleReliabilityInstrumentation) {
  window.__anatoleReliabilityInstrumentation = true;

  window.addEventListener("error", (event) => {
    reportClientEvent({
      kind: "javascript_error",
      message: event.message || "Erreur JavaScript non identifiée",
      stack: event.error instanceof Error ? event.error.stack : null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientEvent({
      kind: "unhandled_rejection",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : null,
    });
  });

  window.addEventListener(
    "load",
    () => {
      window.setTimeout(() => {
        const navigation = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (navigation && navigation.duration >= 4_000) {
          reportClientEvent({
            kind: "performance",
            message: `Navigation lente: ${Math.round(navigation.duration)} ms`,
          });
        }
      }, 0);
    },
    { once: true },
  );
}
