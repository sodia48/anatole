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
  const [positions, setPositions] = useState<TrackedOption[] | null>(() => readPositions());
  const [message, setMessage] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === KEY || event.key === null) setPositions(readPositions()); };
    window.addEventListener("storage", changed);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { window.removeEventListener("storage", changed); window.clearInterval(timer); };
  }, []);

  function save(change: (current: TrackedOption[]) => TrackedOption[]) {
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
    <p>{tr(language, "Suivi manuel enregistré uniquement dans ce navigateur, non synchronisé avec un compte ou un courtier. Les rappels locaux sont visibles ici quand la page est ouverte : aucune notification en arrière-plan pour ces rappels locaux.", "Manual tracking is saved only in this browser, not synced to an account or broker. Local reminders appear here while this page is open: no background notifications for local reminders.")}</p>
    <p>{tr(language, "Le calcul d'un scénario transmet ses jambes et hypothèses à l'API Anatole.", "Calculating a scenario sends its legs and assumptions to the Anatole API.")}</p>
    <p>{tr(language, "Vérifiez l'identité, la date, le fuseau, le multiplicateur, la devise et la convention de prime auprès d'une source autorisée. Les frais, marges, change, exercice et assignation ne sont pas calculés.", "Verify the identity, date, time zone, multiplier, currency and premium convention with an authorized source. Fees, margin, currency conversion, exercise and assignment are not calculated.")}</p>
    {user ? <AccountReminders key={user.id} accountId={user.id} positions={positions ?? []} language={language} now={now} /> : <p>{tr(language, "Connectez-vous pour créer des rappels d'échéance sur votre compte.", "Sign in to create account expiry reminders.")}</p>}
    {positions === null ? <p role="alert">{tr(language, "Stockage indisponible ou données non reconnues. Elles ne seront pas écrasées.", "Storage unavailable or data unrecognized. It will not be overwritten.")}</p> : <>
      {selected ? <PositionForm key={JSON.stringify([selected.symbol, selected.market, selected.contract, selected.expiration, selected.side, selected.strike])} selected={selected} language={language} onSave={(position) => save((current) => [...current, position])} /> : <p>{tr(language, "Sélectionnez « Suivre » sur un contrat dans le screener.", "Select “Track” on a contract in the screener.")}</p>}
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
          <button type="button" onClick={() => save((current) => current.filter((item) => item.id !== position.id))}>{tr(language, "Retirer du suivi", "Remove from tracking")}</button>
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

function PositionForm({ selected, language, onSave }: { selected: OptionContract; language: Language; onSave: (position: TrackedOption) => boolean }) {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [quantity, setQuantity] = useState("1");
  const [multiplier, setMultiplier] = useState("");
  const [premium, setPremium] = useState("");
  const [currency, setCurrency] = useState("");
  const [expiry, setExpiry] = useState("");
  const [reminder, setReminder] = useState("7");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const position: TrackedOption = { id: crypto.randomUUID(), symbol: selected.symbol, underlying: selected.underlying,
      market: selected.market, contract: selected.contract, side: selected.side, strike: selected.strike,
      expiration: selected.expiration ?? "", expiry_at: expiry.trim(), direction,
      quantity: Number(quantity), multiplier: Number(multiplier), premium: Number(premium), currency: currency.trim().toUpperCase(), reminder_days: Number(reminder) };
    if (!confirmed || !multiplier.trim() || !premium.trim() || !validTrackedOption(position)) {
      setError(tr(language, "Vérifiez tous les champs : échéance avec fuseau correspondant au contrat, quantité, multiplicateur, prime et devise ISO.", "Check all fields: zoned expiry matching the contract, quantity, multiplier, premium and ISO currency.")); return;
    }
    setError("");
    if (onSave(position)) setConfirmed(false);
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
    <button type="submit">{tr(language, "Enregistrer la position", "Save position")}</button>
  </form>;
}
