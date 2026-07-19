import { PreferencesForm } from "@/components/settings/PreferencesForm";

export default function PreferencesPage() {
  return (
    <div className="settings-page">
      <header className="panel settings-header">
        <div><span className="eyebrow">ANATOLE SETTINGS</span><h1>Préférences</h1><p>Une expérience cohérente entre Cockpit, Focus, Watchlist et les prochaines sections.</p></div>
      </header>
      <PreferencesForm />
    </div>
  );
}
