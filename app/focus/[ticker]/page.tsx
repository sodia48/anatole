import { FocusClient } from "@/components/stock/FocusClient";
import { getFocusSnapshot } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function FocusPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const snapshot = await getFocusSnapshot(ticker);
  return <FocusClient initialSnapshot={snapshot} />;
}
