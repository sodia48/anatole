import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty-state">
      <span className="eyebrow">ANATOLE</span>
      <h1>Cette page n’existe pas.</h1>
      <p>Revenez au premier module Focus de la nouvelle plateforme.</p>
      <Link className="primary-button" href="/focus/RY">Ouvrir Focus RY</Link>
    </section>
  );
}
