import Link from "next/link";
import styles from "./page.module.css";

type SP = Record<string,string|string[]|undefined>;
const first=(v:SP[string])=>Array.isArray(v)?v[0]??"":v??"";
function num(v:SP[string],min=-1e9,max=1e9){const r=first(v).trim().replace(",",".");if(!r)return null;const n=Number(r);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):null}
const money=(v:number|null)=>v===null?"N/D":new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(v);
const pct=(v:number|null,d=2)=>v===null?"N/D":`${v>0?"+":""}${v.toFixed(d)} %`;
const bps=(v:number|null)=>v===null?"N/D":`${v>0?"+":""}${v.toFixed(0)} bps`;

type Bond={issuer:string;mv:number|null;dur:number|null;conv:number|null;yieldPct:number|null;spread:number|null;mat:number|null;coverage:number|null;impact:number|null;pnl:number|null};

function makeBond(p:SP,i:number,rate:number|null,spreadShock:number|null):Bond{
  const issuer=first(p[`issuer_${i}`]).trim().slice(0,80);
  const mv=num(p[`mv_${i}`],0,1e11),dur=num(p[`dur_${i}`],0,100),conv=num(p[`conv_${i}`],0,10000);
  const yieldPct=num(p[`yield_${i}`],-20,100),spread=num(p[`spread_${i}`],-1000,10000),mat=num(p[`mat_${i}`],0,100),coverage=num(p[`coverage_${i}`],-100,1000);
  const dy=rate!==null&&spreadShock!==null?(rate+spreadShock)/10000:null;
  const impact=dur!==null&&conv!==null&&dy!==null?(-dur*dy+.5*conv*dy*dy)*100:null;
  const pnl=mv!==null&&impact!==null?mv*impact/100:null;
  return{issuer,mv,dur,conv,yieldPct,spread,mat,coverage,impact,pnl};
}

function weighted(bonds:Bond[],key:"dur"|"conv"|"yieldPct"|"spread"|"mat"){
  const valid=bonds.filter(b=>b.mv!==null&&b.mv>0&&b[key]!==null);
  const total=valid.reduce((s,b)=>s+(b.mv??0),0); if(!valid.length||total<=0)return null;
  return valid.reduce((s,b)=>s+(b.mv??0)*(b[key]??0),0)/total;
}

export default async function Page({searchParams}:{searchParams:Promise<SP>}){
  const p=await searchParams;
  const rate=num(p.rate,-2000,2000),spreadShock=num(p.spread_shock,-2000,5000);
  const y2=num(p.y2,-20,100),y5=num(p.y5,-20,100),y10=num(p.y10,-20,100);
  const bonds=[1,2,3,4].map(i=>makeBond(p,i,rate,spreadShock));
  const active=bonds.filter(b=>b.issuer||b.mv!==null||b.dur!==null||b.spread!==null);
  const total=active.length?active.reduce((s,b)=>s+(b.mv??0),0):null;
  const dur=weighted(active,"dur"),conv=weighted(active,"conv"),wy=weighted(active,"yieldPct"),ws=weighted(active,"spread"),wm=weighted(active,"mat");
  const pnl=active.length?active.reduce((s,b)=>s+(b.pnl??0),0):null;
  const impact=total!==null&&total>0&&pnl!==null?pnl/total*100:null;
  const refi=total!==null&&total>0?active.reduce((s,b)=>s+(b.mv!==null&&b.mat!==null&&b.mat<=2?b.mv:0),0)/total*100:null;
  const weak=active.filter(b=>b.coverage!==null&&b.coverage<2).length;
  const slope=y2!==null&&y10!==null?(y10-y2)*100:null;
  const curve=slope===null?"Courbe incomplète":slope>25?"Courbe pentue positive":slope<-25?"Courbe inversée":"Courbe relativement plate";
  const show=active.length>0||[rate,spreadShock,y2,y5,y10].some(v=>v!==null);

  return <main className={styles.shell} data-testid="institutional-fixed-income-center">
    <header className={styles.hero}><div><Link href="/institutionnel/multi-actifs">← Multi-Asset</Link><span>ANATOLE INSTITUTIONAL · FIXED INCOME & CREDIT</span><h1>Fixed Income & Credit Workbench</h1><p>Analyse duration, convexité, spread, maturités, couverture et scénarios à partir de données saisies, sans fabriquer de courbe ou de spread live.</p></div><aside><strong>Scenario math, not a live bond feed</strong><span>Les calculs utilisent seulement les valeurs entrées par l&apos;analyste.</span></aside></header>

    <nav className={styles.nav}><Link href="/institutionnel/multi-actifs">Multi-Asset →</Link><Link href="/institutionnel/risque">Risk Center →</Link><Link href="/institutionnel/macro">Macro →</Link><Link href="/institutionnel/construction">Construction →</Link></nav>

    <section className={styles.states}><article><b>#54 Fixed Income Workbench</b><span>Bridge V1</span></article><article><b>#55 Credit Intelligence</b><span>Bridge V1</span></article><article><b>Pricing</b><span>Fondation</span></article><article><b>Market Data</b><span>À brancher</span></article></section>

    <section className={styles.panel}><h2>Courbe & scénario</h2><form method="get" className={styles.form}>
      <div className={styles.five}>
        <label>2Y yield %<input name="y2" defaultValue={first(p.y2)} placeholder="3.50"/></label>
        <label>5Y yield %<input name="y5" defaultValue={first(p.y5)} placeholder="3.75"/></label>
        <label>10Y yield %<input name="y10" defaultValue={first(p.y10)} placeholder="4.00"/></label>
        <label>Choc taux bps<input name="rate" defaultValue={first(p.rate)} placeholder="100"/></label>
        <label>Choc spread bps<input name="spread_shock" defaultValue={first(p.spread_shock)} placeholder="50"/></label>
      </div>
      <h2>Portefeuille obligataire</h2>
      <div className={styles.table}><div className={styles.head}><span>Émetteur</span><span>Valeur</span><span>Duration</span><span>Convexité</span><span>Yield</span><span>Spread</span><span>Maturité</span><span>Coverage</span></div>
      {[1,2,3,4].map(i=><div key={i}><input name={`issuer_${i}`} defaultValue={first(p[`issuer_${i}`])} placeholder={`Émetteur ${i}`}/><input name={`mv_${i}`} defaultValue={first(p[`mv_${i}`])} placeholder="1000000"/><input name={`dur_${i}`} defaultValue={first(p[`dur_${i}`])} placeholder="4"/><input name={`conv_${i}`} defaultValue={first(p[`conv_${i}`])} placeholder="25"/><input name={`yield_${i}`} defaultValue={first(p[`yield_${i}`])} placeholder="4.5"/><input name={`spread_${i}`} defaultValue={first(p[`spread_${i}`])} placeholder="120"/><input name={`mat_${i}`} defaultValue={first(p[`mat_${i}`])} placeholder="3"/><input name={`coverage_${i}`} defaultValue={first(p[`coverage_${i}`])} placeholder="3"/></div>)}</div>
      <div className={styles.actions}><button type="submit">Calculer le scénario</button><Link href="/institutionnel/multi-actifs/fixed-income">Effacer</Link></div>
    </form></section>

    {show?<section className={styles.results} data-testid="institutional-fixed-income-results">
      <article className={styles.panel}><h2>Courbe</h2><div className={styles.metrics}><div><span>2Y</span><b>{pct(y2)}</b></div><div><span>5Y</span><b>{pct(y5)}</b></div><div><span>10Y</span><b>{pct(y10)}</b></div><div><span>10Y-2Y</span><b>{bps(slope)}</b></div></div><p className={styles.note}>{curve}</p></article>
      <article className={styles.panel}><h2>Portfolio fixed income</h2><div className={styles.metrics}><div><span>Valeur</span><b>{money(total)}</b></div><div><span>Duration</span><b>{dur?.toFixed(2)??"N/D"}</b></div><div><span>Convexité</span><b>{conv?.toFixed(2)??"N/D"}</b></div><div><span>Yield</span><b>{pct(wy)}</b></div><div><span>Spread</span><b>{bps(ws)}</b></div><div><span>Maturité</span><b>{wm?.toFixed(2)??"N/D"} ans</b></div></div></article>
      <article className={styles.panel}><h2>Stress taux + spread</h2><div className={styles.metrics}><div><span>Choc taux</span><b>{bps(rate)}</b></div><div><span>Choc spread</span><b>{bps(spreadShock)}</b></div><div><span>Impact estimé</span><b>{pct(impact)}</b></div><div><span>P&amp;L estimé</span><b>{money(pnl)}</b></div></div><p className={styles.note}>Approximation V1 : ΔP/P ≈ -Duration×Δy + 0,5×Convexité×Δy².</p></article>
      <article className={styles.panel}><h2>Credit & refinancing</h2><div className={styles.metrics}><div><span>Échéance ≤ 2 ans</span><b>{pct(refi)}</b></div><div><span>Coverage &lt; 2x</span><b>{weak}</b></div><div><span>Spread pondéré</span><b>{bps(ws)}</b></div><div><span>Émetteurs saisis</span><b>{active.length}</b></div></div></article>
    </section>:<section className={styles.empty}><b>Aucun portefeuille obligataire défini.</b><span>Renseigne une courbe ou une obligation.</span></section>}
  </main>;
}
