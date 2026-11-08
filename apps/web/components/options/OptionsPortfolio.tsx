"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "@/components/providers/AccountProvider";
import type { OptionChainSnapshot, OptionContract } from "@/lib/options-api";
import { parseTrackedOptions, validTrackedOption, type TrackedOption } from "./options-positions";
import { useOptionsText } from "./OptionsCopyProvider";
import "./options-portfolio.css";

const KEY = "anatole:options-positions:v1";
type Language = "fr" | "en";
const tr = (language: Language, fr: string, en: string) => language === "fr" ? fr : en;

function readPositions(): TrackedOption[] | null {
  try { return parseTrackedOptions(window.localStorage.getItem(KEY)); } catch { return null; }
}

export function OptionsPortfolio({ chain, selected, language, onAnalyze }: { chain: OptionChainSnapshot | null; selected: OptionContract | null; language: Language; onAnalyze: (position: TrackedOption) => boolean }) {
  const { user } = useAccount();
  return <OptionsPortfolioForAccount key={user?.id ?? "anonymous"} chain={chain} selected={selected} language={language} onAnalyze={onAnalyze} accountId={user?.id ?? null} />;
}

function OptionsPortfolioForAccount({ chain, selected, language, onAnalyze, accountId }: { chain: OptionChainSnapshot | null; selected: OptionContract | null; language: Language; onAnalyze: (position: TrackedOption) => boolean; accountId: string | null }) {
  const t = useOptionsText(language);
  const [positions, setPositions] = useState<TrackedOption[] | null>(() => readPositions());
  const [accountRevision, setAccountRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (accountRevision === null && (event.key === KEY || event.key === null)) setPositions(readPositions()); };
    window.addEventListener("storage", changed);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { window.removeEventListener("storage", changed); window.clearInterval(timer); };
  }, [accountRevision]);

  async function loadAccount() {
    if (!accountId || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/option-positions", { cache: "no-store", headers: { "X-Anatole-Account": accountId } });
      if (!response.ok) throw new Error();
      const data = await response.json() as { revision: number; positions: unknown };
      const parsed = parseTrackedOptions(JSON.stringify({ version: 1, positions: data.positions }));
      if (!Number.isSafeInteger(data.revision) || data.revision < 0 || !parsed) throw new Error();
      setPositions(parsed); setAccountRevision(data.revision);
      setMessage(t("portfolio_001"));
    } catch { setMessage(t("portfolio_002")); }
    finally { setBusy(false); }
  }

  async function save(change: (current: TrackedOption[]) => TrackedOption[]) {
    if (busy) return false;
    if (accountRevision !== null && accountId && positions) {
      const next = change(positions);
      if (next.length > 100) { setMessage(t("portfolio_003")); return false; }
      setBusy(true);
      try {
        const response = await fetch("/api/account/option-positions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_account_id: accountId, expected_revision: accountRevision, positions: next }) });
        if (response.status === 409) { setMessage(t("portfolio_004")); return false; }
        if (!response.ok) throw new Error();
        const data = await response.json() as { revision: number; positions: unknown };
        const parsed = parseTrackedOptions(JSON.stringify({ version: 1, positions: data.positions }));
        if (!Number.isSafeInteger(data.revision) || !parsed) throw new Error();
        setPositions(parsed); setAccountRevision(data.revision); setMessage(t("portfolio_005")); return true;
      } catch { setMessage(t("portfolio_006")); return false; }
      finally { setBusy(false); }
    }
    const current = readPositions();
    if (!current) { setPositions(null); setMessage(t("portfolio_007")); return false; }
    const next = change(current);
    if (next.length > 100) { setMessage(t("portfolio_008")); return false; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ version: 1, positions: next }));
      setPositions(next); setMessage(t("portfolio_009")); return true;
    } catch { setMessage(t("portfolio_010")); return false; }
  }

  return <section id="options-positions" className="panel op-positions" aria-label={t("portfolio_011")}>
    <h2>{t("portfolio_012")}</h2>
    <div className="op-positionIntro"><strong>{accountRevision === null ? t("portfolio_013") : t("portfolio_014")}</strong><span>{t("portfolio_015")}</span></div>
    {accountId ? <div className="op-positionSource">
      <button type="button" disabled={busy || accountRevision === null} onClick={() => { setPositions(readPositions()); setAccountRevision(null); setMessage(""); }}>{t("portfolio_016")}</button>{" "}
      <button type="button" disabled={busy} onClick={() => void loadAccount()}>{accountRevision === null ? t("portfolio_017") : t("portfolio_018")}</button>
    </div> : null}
    <details className="op-positionNotes"><summary>{t("portfolio_019")}</summary>
      <p>{t("portfolio_020")}</p>
      {accountId ? <p>{t("portfolio_021")}</p> : null}
      <p>{t("portfolio_022")}</p>
      <p>{t("portfolio_023")}</p>
    </details>
    {accountId ? <AccountReminders key={accountId} accountId={accountId} positions={positions ?? []} language={language} now={now} /> : null}
    {positions === null ? <p role="alert">{t("portfolio_024")}</p> : <>
      {selected ? <PositionForm key={JSON.stringify([selected.symbol, selected.market, selected.contract, selected.expiration, selected.side, selected.strike, accountRevision !== null])} selected={selected} language={language} busy={busy} onSave={(position) => save((current) => [...current, position])} /> : <p>{t("portfolio_025")}</p>}
      {message ? <p role="status">{message}</p> : null}
      {analyzed ? <a href="#options-strategy-builder">{t("portfolio_026")}</a> : null}
      <h3>{t("portfolio_027")} ({positions.length})</h3>
      {positions.length ? <ul className="op-position-list">{positions.map((position) => {
        const due = Date.parse(position.expiry_at) - now;
        const candidates = chain?.contracts.filter((item) => item.symbol === position.symbol && item.market === position.market &&
          item.underlying === position.underlying && item.contract === position.contract && item.expiration === position.expiration &&
          item.side === position.side && item.strike === position.strike) ?? [];
        const quote = candidates.length === 1 ? candidates[0] : null;
        return <li key={position.id}>
          <strong>{position.symbol} · {position.side.toUpperCase()} {position.strike} · {position.expiration}</strong>
          <span>{position.contract ? `${position.contract} · ` : ""}{position.direction === "long" ? t("portfolio_028") : t("portfolio_029")} · {position.quantity} × {position.multiplier} · {position.currency}</span>
          <span>{t("portfolio_030")}: {position.premium} · {t("portfolio_031")}: {position.direction === "long" ? "−" : "+"}{(position.premium * position.multiplier * position.quantity).toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 })} {position.currency}</span>
          <span>{t("portfolio_032")}: {position.expiry_at}</span>
          <strong>{due <= 0 ? t("portfolio_033") : due <= position.reminder_days * 86400000 ? t("portfolio_034") : t("portfolio_035")}</strong>
          {quote ? <span>{t("portfolio_036")}: Bid {quote.bid ?? "N/D"} · Ask {quote.ask ?? "N/D"} · {quote.source}{quote.delayed ? ` · ${t("portfolio_037")}` : ""}{chain?.stale ? ` · ${t("portfolio_038")}` : ""} · {chain?.generated_at}</span> : <span>{t("portfolio_039")}</span>}
          <span>{t("portfolio_040")}</span>
          <button type="button" onClick={() => { const added = onAnalyze(position); setAnalyzed(added); setMessage(added ? t("portfolio_041") : t("portfolio_042")); }}>{t("portfolio_043")}</button>
          <button type="button" disabled={busy} onClick={() => void save((current) => current.filter((item) => item.id !== position.id))}>{t("portfolio_044")}</button>
        </li>;
      })}</ul> : <p>{t("portfolio_045")}</p>}
    </>}
  </section>;
}

type AccountReminder = { position_id: string; underlying: string; expires_at: string; reminder_days: number; triggered_at: string | null };

function AccountReminders({ accountId, positions, language, now }: { accountId: string; positions: TrackedOption[]; language: Language; now: number }) {
  const t = useOptionsText(language);
  const [reminders, setReminders] = useState<AccountReminder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications/option-reminders", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<AccountReminder[]>; })
      .then((items) => { if (!Array.isArray(items)) throw new Error(); setReminders(items); setError(""); }).catch(() => { if (!controller.signal.aborted) setError(t("portfolio_046")); });
    return () => controller.abort();
  }, [attempt, language, t]);

  async function change(position: TrackedOption | AccountReminder, remove: boolean) {
    setBusy(true); setError("");
    const id = "id" in position ? position.id : position.position_id;
    try {
      const response = await fetch(`/api/notifications/option-reminders${remove ? `/${encodeURIComponent(id)}` : ""}`, {
        method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json", "X-Anatole-Account": accountId },
        body: remove ? undefined : JSON.stringify({ expected_account_id: accountId, position_id: id, underlying: position.underlying,
          expires_at: "expiry_at" in position ? position.expiry_at : position.expires_at, reminder_days: position.reminder_days }),
      });
      if (!response.ok) throw new Error();
      const list = await fetch("/api/notifications/option-reminders", { cache: "no-store" });
      if (!list.ok) throw new Error();
      setReminders(await list.json() as AccountReminder[]);
    } catch { setError(t("portfolio_047")); }
    finally { setBusy(false); }
  }
  return <div className="op-account-reminders">
    <h3>{t("portfolio_048")}</h3>
    <p>{t("portfolio_049")}</p>
    <a href="/notifications">{t("portfolio_050")}</a>{" "}
    <button type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>{t("portfolio_051")}</button>
    {error ? <p role="alert">{error}</p> : null}
    {reminders === null ? <p>{t("portfolio_052")}</p> : <>
      {positions.filter((position) => !reminders.some((item) => item.position_id.toLowerCase() === position.id.toLowerCase())).map((position) =>
        <button key={position.id} type="button" disabled={busy || Date.parse(position.expiry_at) <= now || !/^[A-Z0-9.^-]{1,16}$/.test(position.underlying) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(position.id)} onClick={() => void change(position, false)}>{tr(language, `Activer le rappel ${position.symbol}`, `Enable reminder ${position.symbol}`)}</button>)}
      <ul className="op-position-list">{reminders.map((item) => <li key={item.position_id}>
        <span>{item.underlying} · {item.expires_at} · {item.reminder_days} j</span>
        <span>{item.triggered_at ? t("portfolio_053") : t("portfolio_054")}</span>
        <button type="button" disabled={busy} onClick={() => void change(item, true)}>{t("portfolio_055")}</button>
      </li>)}</ul>
    </>}
  </div>;
}

function PositionForm({ selected, language, onSave, busy }: { selected: OptionContract; language: Language; onSave: (position: TrackedOption) => Promise<boolean>; busy: boolean }) {
  const t = useOptionsText(language);
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [quantity, setQuantity] = useState("1");
  const [multiplier, setMultiplier] = useState("");
  const [premium, setPremium] = useState("");
  const [currency, setCurrency] = useState("");
  const [expiry, setExpiry] = useState("");
  const [reminder, setReminder] = useState("7");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const position: TrackedOption = { id: crypto.randomUUID(), symbol: selected.symbol, underlying: selected.underlying,
      market: selected.market, contract: selected.contract, side: selected.side, strike: selected.strike,
      expiration: selected.expiration ?? "", expiry_at: expiry.trim(), direction,
      quantity: Number(quantity), multiplier: Number(multiplier), premium: Number(premium), currency: currency.trim().toUpperCase(), reminder_days: Number(reminder) };
    if (!confirmed || !multiplier.trim() || !premium.trim() || !validTrackedOption(position)) {
      setError(t("portfolio_056")); return;
    }
    setError("");
    if (await onSave(position)) setConfirmed(false);
  }
  return <form className="op-position-form" onSubmit={submit}>
    <h3>{t("portfolio_057")}: {selected.symbol}</h3>
    <p>{selected.side.toUpperCase()} {selected.strike} · {selected.expiration ?? "N/D"}{selected.contract ? ` · ${selected.contract}` : ""}</p>
    <div className="op-position-fields">
      <label>{t("portfolio_058")}<select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")}><option value="long">{t("portfolio_059")}</option><option value="short">{t("portfolio_060")}</option></select></label>
      <label>{t("portfolio_061")}<input type="number" min="1" max="10000" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
      <label>{t("portfolio_062")}<input type="number" min="0.000001" step="any" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} required /></label>
      <label>{t("portfolio_063")}<input type="number" min="0" step="any" value={premium} onChange={(e) => setPremium(e.target.value)} required /></label>
      <label>{t("portfolio_064")}<input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} required /></label>
      <label>{t("portfolio_065")}<input value={expiry} placeholder="2027-11-25T16:00:00-05:00" onChange={(e) => setExpiry(e.target.value)} required /></label>
      <label>{t("portfolio_066")}<select value={reminder} onChange={(e) => setReminder(e.target.value)}><option value="0">0 j</option><option value="1">1 j</option><option value="3">3 j</option><option value="7">7 j</option><option value="14">14 j</option><option value="30">30 j</option></select></label>
    </div>
    <label className="op-position-confirm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{t("portfolio_067")}</label>
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" disabled={busy}>{t("portfolio_068")}</button>
  </form>;
}
