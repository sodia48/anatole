import { render, waitFor } from "@testing-library/react-native";

import { LocaleProvider } from "@/src/lib/i18n";
import { CoverageBadge, DataFreshness, OfflineBadge, SourceBadge } from "./dataQuality";

it("labels offline and stale data without presenting it as live", async () => {
  const view = await render(<LocaleProvider><OfflineBadge asOf="2026-09-03T19:31:00Z" forceOffline /><DataFreshness asOf="2026-09-03T19:31:00Z" delayed /></LocaleProvider>);
  await waitFor(() => expect(view.getByText(/Hors ligne · Dernières données disponibles/)).toBeTruthy());
  expect(view.getByText(/Différé/)).toBeTruthy();
});

it("shares coverage and source formatting", async () => {
  const view = await render(<LocaleProvider><CoverageBadge available={54} expected={60} /><SourceBadge source={null} /></LocaleProvider>);
  await waitFor(() => expect(view.getByText("Couverture · 54/60")).toBeTruthy());
  expect(view.getByText("Source N/D")).toBeTruthy();
});
