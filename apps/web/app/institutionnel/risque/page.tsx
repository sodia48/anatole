import { PortfolioClient } from "@/components/workspace/PortfolioClient";

export default function InstitutionalRiskPage() {
  return (
    <section data-testid="institutional-risk-center">
      <header
        style={{
          padding: "18px 18px 0",
          display: "grid",
          gap: 6,
        }}
      >
        <span className="eyebrow">ANATOLE INSTITUTIONAL · RISK</span>
        <h1 style={{ margin: 0 }}>Risk Center</h1>
      </header>

      <PortfolioClient initialIntelligenceTab="risk" />
    </section>
  );
}
