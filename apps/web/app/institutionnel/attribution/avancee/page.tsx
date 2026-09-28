import Link from "next/link";
import styles from "./page.module.css";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] ?? "" : v ?? "";
const clean = (v: string | string[] | undefined, n = 120) => first(v).trim().slice(0, n);
function num(v: string | string[] | undefined, min=-1000, max=1000) {
  const raw = first(v).trim().replace(",", ".");
  if (!raw) return null;
  const x = Number(raw);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null;
}
function bps(v: number | null) {
  if (v === null) return "N/D";
  return `${v > 0 ? "+" : ""}${v.toFixed(0)} bps`;
}
function pct(v: number | null) {
  if (v === null) return "N/D";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} %`;
}
type Sleeve = {
  label:string; wp:number|null; wb:number|null; rp:number|null; rb:number|null;
  allocation:number|null; selection:number|null; interaction:number|null; total:number|null;
};
function sleeve(p:SP, i:number): Sleeve {
  const label=clean(p[`label_${i}`],80)||`Segment ${i}`;
  const wp=num(p[`wp_${i}`],0,100), wb=num(p[`wb_${i}`],0,100);
  const rp=num(p[`rp_${i}`],-100,1000), rb=num(p[`rb_${i}`],-100,1000);
  if ([wp,wb,rp,rb].some(v=>v===null)) return {label,wp,wb,rp,rb,allocation:null,selection:null,interaction:null,total:null};
  const Wp=(wp as number)/100, Wb=(wb as number)/100, Rp=(rp as number)/100, Rb=(rb as number)/100;
  const allocation=(Wp-Wb)*Rb*10000;
  const selection=Wb*(Rp-Rb)*10000;
  const interaction=(Wp-Wb)*(Rp-Rb)*10000;
  return {label,wp,wb,rp,rb,allocation,selection,interaction,total:allocation+selection+interaction};
}
function sum(values:Array<number|null>) {
  const x=values.filter((v):v is number=>v!==null);
  return x.length ? x.reduce((a,b)=>a+b,0) : null;
}

export default async function AdvancedAttribution({searchParams}:{searchParams:Promise<SP>}) {
  const p=await searchParams;
  const sleeves=[1,2,3,4].map(i=>sleeve(p,i));
  const complete=sleeves.filter(s=>s.total!==null);
  const portfolioWeight=sum(complete.map(s=>s.wp));
  const benchmarkWeight=sum(complete.map(s=>s.wb));
  const portfolioReturn=complete.length ? complete.reduce((t,s)=>t+((s.wp??0)/100)*((s.rp??0)/100),0)*100 : null;
  const benchmarkReturn=complete.length ? complete.reduce((t,s)=>t+((s.wb??0)/100)*((s.rb??0)/100),0)*100 : null;
  const excessReturn=portfolioReturn!==null&&benchmarkReturn!==null ? (portfolioReturn-benchmarkReturn)*100 : null;
  const allocation=sum(complete.map(s=>s.allocation));
  const selection=sum(complete.map(s=>s.selection));
  const interaction=sum(complete.map(s=>s.interaction));
  const explained=sum(complete.map(s=>s.total));
  const residual=excessReturn!==null&&explained!==null ? excessReturn-explained : null;
  const fx=num(p.fx_bps), factor=num(p.factor_bps), timing=num(p.timing_bps);
  const overlay=[fx,factor,timing].filter((v):v is number=>v!==null);
  const overlayTotal=overlay.length ? overlay.reduce((a,b)=>a+b,0) : null;
  const note=clean(p.note,1000);
  const has=complete.length>0||overlay.length>0||Boolean(note);

  return <main className={styles.shell} data-testid="institutional-advanced-attribution-center">
    <header className={styles.hero}>
      <div>
        <Link href="/institutionnel/attribution">← Decision Review</Link>
        <span>ANATOLE INSTITUTIONAL · ADVANCED ATTRIBUTION</span>
        <h1>Brinson Attribution & Overlay Lab</h1>
        <p>Décompose l&apos;écart de performance en allocation, sélection et interaction. Les overlays FX, facteurs et timing restent des contributions analyste séparées.</p>
      </div>
      <aside><strong>Deterministic, not inferred</strong><span>Aucun rendement, poids benchmark ou facteur n&apos;est inventé.</span></aside>
    </header>

    <nav className={styles.nav}>
      <Link href="/institutionnel/attribution">Decision Review →</Link>
      <Link href="/portefeuille">Portefeuille →</Link>
      <Link href="/institutionnel/facteurs">Factor X-Ray →</Link>
      <Link href="/institutionnel/multi-actifs">Multi-Asset →</Link>
    </nav>

    <section className={styles.panel}>
      <h2>Segments portefeuille / benchmark</h2>
      <form method="get" className={styles.form}>
        <div className={styles.table}>
          <div className={styles.tableHead}><span>Segment</span><span>Poids P %</span><span>Poids B %</span><span>Rendement P %</span><span>Rendement B %</span></div>
          {[1,2,3,4].map(i=><div key={i}>
            <input name={`label_${i}`} defaultValue={first(p[`label_${i}`])} placeholder={`Segment ${i}`} />
            <input name={`wp_${i}`} defaultValue={first(p[`wp_${i}`])} placeholder="25" />
            <input name={`wb_${i}`} defaultValue={first(p[`wb_${i}`])} placeholder="25" />
            <input name={`rp_${i}`} defaultValue={first(p[`rp_${i}`])} placeholder="5" />
            <input name={`rb_${i}`} defaultValue={first(p[`rb_${i}`])} placeholder="4" />
          </div>)}
        </div>
        <div className={styles.three}>
          <label>FX bps<input name="fx_bps" defaultValue={first(p.fx_bps)} placeholder="0" /></label>
          <label>Facteurs bps<input name="factor_bps" defaultValue={first(p.factor_bps)} placeholder="0" /></label>
          <label>Timing bps<input name="timing_bps" defaultValue={first(p.timing_bps)} placeholder="0" /></label>
        </div>
        <label>Note méthodologique<textarea name="note" defaultValue={note} rows={3} /></label>
        <div className={styles.actions}><button type="submit">Calculer l&apos;attribution</button><Link href="/institutionnel/attribution/avancee">Effacer</Link></div>
      </form>
    </section>

    {has ? <section className={styles.results} data-testid="institutional-advanced-attribution-results">
      <article className={styles.panel}>
        <h2>Réconciliation</h2>
        <div className={styles.metrics}>
          <div><span>Poids portefeuille</span><b>{pct(portfolioWeight)}</b></div>
          <div><span>Poids benchmark</span><b>{pct(benchmarkWeight)}</b></div>
          <div><span>Rendement P</span><b>{pct(portfolioReturn)}</b></div>
          <div><span>Rendement B</span><b>{pct(benchmarkReturn)}</b></div>
          <div><span>Excess return</span><b>{bps(excessReturn)}</b></div>
          <div><span>Résiduel BHB</span><b>{bps(residual)}</b></div>
        </div>
      </article>
      <article className={styles.panel}>
        <h2>Attribution totale</h2>
        <div className={styles.metrics}>
          <div><span>Allocation</span><b>{bps(allocation)}</b></div>
          <div><span>Sélection</span><b>{bps(selection)}</b></div>
          <div><span>Interaction</span><b>{bps(interaction)}</b></div>
          <div><span>Expliqué BHB</span><b>{bps(explained)}</b></div>
          <div><span>Overlay analyste</span><b>{bps(overlayTotal)}</b></div>
          <div><span>Segments complets</span><b>{complete.length}/4</b></div>
        </div>
      </article>
      <article className={`${styles.panel} ${styles.full}`}>
        <h2>Détail par segment</h2>
        <div className={styles.detail}>
          <div className={styles.detailHead}><span>Segment</span><span>Allocation</span><span>Sélection</span><span>Interaction</span><span>Total</span></div>
          {sleeves.map((s,i)=><div key={`${s.label}-${i}`}><b>{s.label}</b><span>{bps(s.allocation)}</span><span>{bps(s.selection)}</span><span>{bps(s.interaction)}</span><strong>{bps(s.total)}</strong></div>)}
        </div>
        <p className={styles.note}>Méthode BHB V1 : allocation = (Wp-Wb)×Rb, sélection = Wb×(Rp-Rb), interaction = (Wp-Wb)×(Rp-Rb). Les poids portefeuille et benchmark doivent couvrir 100 % pour une réconciliation complète.</p>
      </article>
    </section> : <section className={styles.empty}><b>Aucune attribution calculée.</b><span>Renseigne au moins un segment complet.</span></section>}
  </main>;
}
