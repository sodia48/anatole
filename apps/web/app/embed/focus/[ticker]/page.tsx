import { FocusWorkspace } from "@/components/focus-pro/FocusWorkspace";
import { getFocusSnapshot } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function EmbeddedFocusPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const snapshot = await getFocusSnapshot(ticker);
  return <FocusWorkspace embedded initialSnapshot={snapshot} />;
}
