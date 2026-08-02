import { Suspense } from "react";

import { SettingsHubClient } from "@/components/settings/SettingsHubClient";

export default function ParametresPage() {
  return (
    <Suspense fallback={<div className="panel" style={{ minHeight: 240 }} />}>
      <SettingsHubClient />
    </Suspense>
  );
}
