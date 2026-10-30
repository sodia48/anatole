"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "@/components/providers/AccountProvider";
import type { OptionChainSnapshot, OptionContract } from "@/lib/options-api";
import { parseTrackedOptions, validTrackedOption, type TrackedOption } from "./options-positions";
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
      setMessage(tr(language, "Positions du compte chargées.", "Account positions loaded."));
    } catch { setMessage(tr(language, "Chargement du compte impossible.", "Could not load account positions.")); }
    finally { setBusy(false); }
  }

  async function save(change: (current: TrackedOption[]) => TrackedOption[]) {
    if (busy) return false;
    if (accountRevision !== null && accountId && positions) {
      const next = change(positions);
      if (next.length > 100) { setMessage(tr(language, "Limite de 100 positions atteinte.", "100-position limit reached.")); return false; }
      setBusy(true);
      try {
        const response = await fetch("/api/account/option-positions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_account_id: accountId, expected_revision: accountRevision, positions: next }) });
        if (response.status === 409) { setMessage(tr(language, "Les données ont changé ailleurs. Actualisez.", "Data changed elsewhere. Refresh.")); return false; }
        if (!response.ok) throw new Error();
        const data = await response.json() as { revision: number; positions: unknown };
        const parsed = parseTrackedOptions(JSON.stringify({ version: 1, positions: data.positions }));
        if (!Number.isSafeInteger(data.revision) || !parsed) throw new Error();
        setPositions(parsed); setAccountRevision(data.revision); setMessage(tr(language, "Enregistré dans le compte.", "Saved to your account.")); return true;
      } catch { setMessage(tr(language, "Échec : actualisez avant de réessayer.", "Save failed: refresh and retry.")); return false; }
      finally { setBusy(false); }
    }
    const current = readPositions();
    if (!current) { setPositions(null); setMessage(tr(language, "Stockage indisponible ou données non reconnues ; aucune modification enregistrée.", "Storage unavailable or data unrecognized; nothing was saved.")); return false; }
    const next = change(current);
    if (next.length > 100) { setMessage(tr(language, "Limite de 100 positions atteinte.", "100-position limit reached.")); return false; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ version: 1, positions: next }));
      setPositions(next); setMessage(tr(language, "Enregistré sur cet appareil.", "Saved on this device.")); return true;
    } catch { setMessage(tr(language, "Enregistrement local impossible.", "Local save failed.")); return false; }
  }

  return <section id="options-positions" className="panel op-positions" aria-label={tr(language, "Positions d'options", "Options positions")}>
    <h2>{tr(language, "Positions d'options", "Options positions")}</h2>
    <p>{tr(language, "Suivi manuel : listes séparées, sans courtier. Rappels locaux visibles sur cette page : aucune notification en arrière-plan.", "Manual tracking: separate lists, no broker. Local reminders appear on this page: no background notifications.")}</p>
    {accountId ? <div><p>{tr(language, "Le compte stocke contrats, quantités, primes et hypothèses sur le serveur Anatole. Ils ne sont pas automatiquement transmis à l'assistant.", "The account stores contracts, quantities, premiums and assumptions on Anatole's server. They are not automatically sent to the assistant.")}</p>
      <button type="button" disabled={busy || accountRevision === null} onClick={() => { setPositions(readPositions()); setAccountRevision(null); setMessage(""); }}>{tr(language, "Positions de cet appareil", "Positions on this device")}</button>{" "}
      <button type="button" disabled={busy} onClick={() => void loadAccount()}>{accountRevision === null ? tr(language, "Ouvrir les positions du compte", "Open account positions") : tr(language, "Actualiser les positions du compte", "Refresh account positions")}</button>
      <p>{accountRevision === null ? tr(language, "Liste de cet appareil", "This device's list") : tr(language, "Liste du compte", "Account list")}</p></div> : null}
    <p>{tr(language, "Le calcul d'un scénario transmet ses jambes et hypothèses à l'API Anatole.", "Calculating a scenario sends its legs and assumptions to the Anatole API.")}</p>
    <p>{tr(language, "Vérifiez l'identité, la date, le fuseau, le multiplicateur, la devise et la convention de prime auprès d'une source autorisée. Les frais, marges, change, exercice et assignation ne sont pas calculés.", "Verify the identity, date, time zone, multiplier, currency and premium convention with an authorized source. Fees, margin, currency conversion, exercise and assignment are not calculated.")}</p>
    {accountId ? <AccountReminders key={accountId} accountId={accountId} positions={positions ?? []} language={language} now={now} /> : <p>{tr(language, "Connectez-vous pour créer des rappels d'échéance sur votre compte.", "Sign in to create account expiry reminders.")}</p>}
    {positions === null ? <p role="alert">{tr(language, "Stockage indisponible ou données non reconnues. Elles ne seront pas écrasées.", "Storage unavailable or data unrecognized. It will not be overwritten.")}</p> : <>
      {selected ? <PositionForm key={JSON.stringify([selected.symbol, selected.market, selected.contract, selected.expiration, selected.side, selected.strike, accountRevision !== null])} selected={selected} language={language} busy={busy} onSave={(position) => save((current) => [...current, position])} /> : <p>{tr(language, "Sélectionnez « Suivre » sur un contrat dans le screener.", "Select “Track” on a contract in the screener.")}</p>}
      {message ? <p role="status">{message}</p> : null}
      {analyzed ? <a href="#options-strategy-builder">{tr(language, "Voir le constructeur de stratégie", "View the strategy builder")}</a> : null}
      <h3>{tr(language, "Positions suivies", "Tracked positions")} ({positions.length})</h3>
      {positions.length ? <ul className="op-position-list">{positions.map((position) => {
        const due = Date.parse(position.expiry_at) - now;
        const candidates = chain?.contracts.filter((item) => item.symbol === position.symbol && item.market === position.market &&
          item.underlying === position.underlying && item.contract === position.contract && item.expiration === position.expiration &&
          item.side === position.side && item.strike === position.strike) ?? [];
        const quote = candidates.length === 1 ? candidates[0] : null;
        return <li key={position.id}>
          <strong>{position.symbol} · {position.side.toUpperCase()} {position.strike} · {position.expiration}</strong>
          <span>{position.contract ? `${position.contract} · ` : ""}{position.direction === "long" ? tr(language, "Achat", "Long") : tr(language, "Vente", "Short")} · {position.quantity} × {position.multiplier} · {position.currency}</span>
          <span>{tr(language, "Prime saisie par unité", "Entered premium per unit")}: {position.premium} · {tr(language, "flux initial estimé", "estimated initial cash flow")}: {position.direction === "long" ? "−" : "+"}{(position.premium * position.multiplier * position.quantity).toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 2 })} {position.currency}</span>
          <span>{tr(language, "Échéance saisie", "Entered expiry")}: {position.expiry_at}</span>
          <strong>{due <= 0 ? tr(language, "Échéance passée — vérifier règlement et exercice.", "Expiry passed — verify settlement and exercise.") : due <= position.reminder_days * 86400000 ? tr(language, "Rappel : échéance proche.", "Reminder: expiry approaching.") : tr(language, "Aucun rappel d'échéance pour le moment.", "No expiry reminder yet.")}</strong>
          {quote ? <span>{tr(language, "Chaîne chargée", "Loaded chain")}: Bid {quote.bid ?? "N/D"} · Ask {quote.ask ?? "N/D"} · {quote.source}{quote.delayed ? ` · ${tr(language, "différé", "delayed")}` : ""}{chain?.stale ? ` · ${tr(language, "instantané périmé", "stale snapshot")}` : ""} · {chain?.generated_at}</span> : <span>{tr(language, "Cotations non disponibles ou identité ambiguë dans la chaîne chargée.", "Quotes unavailable or identity ambiguous in the loaded chain.")}</span>}
          <span>{tr(language, "Valeur actuelle et risque total non calculés. Le constructeur permet une simulation théorique à l'échéance.", "Current value and total risk are not calculated. The builder can simulate expiry theoretically.")}</span>
          <button type="button" onClick={() => { const added = onAnalyze(position); setAnalyzed(added); setMessage(added ? tr(language, "Position ajoutée au constructeur : renseignez la devise et l'échéance vérifiées.", "Position added to the builder: enter the verified currency and expiry.") : tr(language, "Limite de 20 jambes atteinte.", "20-leg limit reached.")); }}>{tr(language, "Analyser dans le constructeur", "Analyze in builder")}</button>
          <button type="button" disabled={busy} onClick={() => void save((current) => current.filter((item) => item.id !== position.id))}>{tr(language, "Retirer du suivi", "Remove from tracking")}</button>
        </li>;
      })}</ul> : <p>{tr(language, "Aucune position suivie.", "No tracked positions.")}</p>}
    </>}
  </section>;
}

type AccountReminder = { position_id: string; underlying: string; expires_at: string; reminder_days: number; triggered_at: string | null };

function AccountReminders({ accountId, positions, language, now }: { accountId: string; positions: TrackedOption[]; language: Language; now: number }) {
  const [reminders, setReminders] = useState<AccountReminder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications/option-reminders", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<AccountReminder[]>; })
      .then((items) => { if (!Array.isArray(items)) throw new Error(); setReminders(items); setError(""); }).catch(() => { if (!controller.signal.aborted) setError(tr(language, "Rappels de compte indisponibles.", "Account reminders unavailable.")); });
    return () => controller.abort();
  }, [attempt, language]);

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
    } catch { setError(tr(language, "Rappel non modifié ou actualisation impossible. Réessayez.", "Reminder update or refresh failed. Try again.")); }
    finally { setBusy(false); }
  }
  return <div className="op-account-reminders">
    <h3>{tr(language, "Rappels d'échéance du compte", "Account expiry reminders")}</h3>
    <p>{tr(language, "L'activation envoie au compte le sous-jacent, l'échéance, le délai et un identifiant technique. Les rappels sont indépendants des positions locales. Ils apparaissent dans Notifications lorsque les alertes sont activées et le serveur fonctionne ; aucun courriel ou push n'est garanti. État au dernier chargement.", "Activation sends the underlying, expiry, interval and a technical ID to your account. Reminders are independent of local positions. They appear in Notifications while alerts are enabled and the server is running; email or push is not guaranteed. Status as last loaded.")}</p>
    <a href="/notifications">{tr(language, "Ouvrir Notifications", "Open Notifications")}</a>{" "}
    <button type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>{tr(language, "Actualiser les rappels", "Refresh reminders")}</button>
    {error ? <p role="alert">{error}</p> : null}
    {reminders === null ? <p>{tr(language, "Chargement des rappels…", "Loading reminders…")}</p> : <>
      {positions.filter((position) => !reminders.some((item) => item.position_id.toLowerCase() === position.id.toLowerCase())).map((position) =>
        <button key={position.id} type="button" disabled={busy || Date.parse(position.expiry_at) <= now || !/^[A-Z0-9.^-]{1,16}$/.test(position.underlying) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(position.id)} onClick={() => void change(position, false)}>{tr(language, `Activer le rappel ${position.symbol}`, `Enable reminder ${position.symbol}`)}</button>)}
      <ul className="op-position-list">{reminders.map((item) => <li key={item.position_id}>
        <span>{item.underlying} · {item.expires_at} · {item.reminder_days} j</span>
        <span>{item.triggered_at ? tr(language, "Notification créée", "Notification created") : tr(language, "En attente", "Pending")}</span>
        <button type="button" disabled={busy} onClick={() => void change(item, true)}>{tr(language, "Supprimer ce rappel", "Delete reminder")}</button>
      </li>)}</ul>
    </>}
  </div>;
}

function PositionForm({ selected, language, onSave, busy }: { selected: OptionContract; language: Language; onSave: (position: TrackedOption) => Promise<boolean>; busy: boolean }) {
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
      setError(tr(language, "Vérifiez tous les champs : échéance avec fuseau correspondant au contrat, quantité, multiplicateur, prime et devise ISO.", "Check all fields: zoned expiry matching the contract, quantity, multiplier, premium and ISO currency.")); return;
    }
    setError("");
    if (await onSave(position)) setConfirmed(false);
  }
  return <form className="op-position-form" onSubmit={submit}>
    <h3>{tr(language, "Ajouter au suivi", "Add to tracking")}: {selected.symbol}</h3>
    <p>{selected.side.toUpperCase()} {selected.strike} · {selected.expiration ?? "N/D"}{selected.contract ? ` · ${selected.contract}` : ""}</p>
    <div className="op-position-fields">
      <label>{tr(language, "Sens de la position", "Position direction")}<select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")}><option value="long">{tr(language, "Achat", "Long")}</option><option value="short">{tr(language, "Vente", "Short")}</option></select></label>
      <label>{tr(language, "Nombre de contrats", "Number of contracts")}<input type="number" min="1" max="10000" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
      <label>{tr(language, "Multiplicateur vérifié", "Verified multiplier")}<input type="number" min="0.000001" step="any" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} required /></label>
      <label>{tr(language, "Prime initiale par unité", "Initial premium per unit")}<input type="number" min="0" step="any" value={premium} onChange={(e) => setPremium(e.target.value)} required /></label>
      <label>{tr(language, "Devise ISO vérifiée", "Verified ISO currency")}<input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} required /></label>
      <label>{tr(language, "Échéance vérifiée avec fuseau", "Verified expiry with time zone")}<input value={expiry} placeholder="2027-11-25T16:00:00-05:00" onChange={(e) => setExpiry(e.target.value)} required /></label>
      <label>{tr(language, "Rappel avant échéance", "Reminder before expiry")}<select value={reminder} onChange={(e) => setReminder(e.target.value)}><option value="0">0 j</option><option value="1">1 j</option><option value="3">3 j</option><option value="7">7 j</option><option value="14">14 j</option><option value="30">30 j</option></select></label>
    </div>
    <label className="op-position-confirm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{tr(language, "J'ai vérifié les spécifications et la prime est payée initialement.", "I verified the specifications and the premium is paid upfront.")}</label>
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" disabled={busy}>{tr(language, "Enregistrer la position", "Save position")}</button>
  </form>;
}
