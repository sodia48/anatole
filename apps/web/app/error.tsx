"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state">
      <span className="eyebrow">SERVICE TEMPORAIREMENT LIMITÉ</span>
      <h1>Anatole reste accessible.</h1>
      <p>Une source ou un composant n’a pas répondu correctement. Vous pouvez relancer cette vue.</p>
      <button className="primary-button" onClick={reset}>Réessayer</button>
    </section>
  );
}
