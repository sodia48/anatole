import { FocusClient } from "@/components/stock/FocusClient";
import { getFocusSnapshot } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function FocusPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ view?: string }> }) {
  const { ticker } = await params;
  const { view } = await searchParams;
  const snapshot = await getFocusSnapshot(ticker);
  const researchView = view === "sector" ? "diagnostic" : view === "diagnostic" || view === "peers" || view === "scenarios" || view === "documents" || view === "capital" || view === "financials" || view === "analysts" ? view : undefined;
  return <FocusClient initialSnapshot={snapshot} initialFundamentalView={researchView} initialDiagnosticSection={view === "sector" ? "sector" : undefined} />;
}
