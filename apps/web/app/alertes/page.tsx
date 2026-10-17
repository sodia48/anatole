import { AlertsClient, type AlertsCopy } from "@/components/workspace/AlertsClient";

const copy: AlertsCopy = {
  fr: {
    intro: "Surveille les seuils de marché et les changements financiers officiels vérifiables. Les règles locales sont évaluées lorsque cette section est ouverte.",
    createHint: "Les notifications du navigateur sont facultatives; la page affiche toujours l’état de chaque seuil.",
    scope: "les règles sont évaluées lorsque cette page est ouverte. Une surveillance continue côté serveur nécessite un compte utilisateur et une base persistante.",
    sectionHint: "Une alerte déclenchée ne répète pas sans cesse la même notification.",
    emptyHint: "Crée un premier seuil de prix, RSI ou score Anatole.",
    metricLabels: ["Prix", "Variation du jour (%)", "RSI 14", "Momentum 20 séances (%)", "Volume relatif (x)", "Score Anatole"],
    eventLabels: ["Baisse de marge opérationnelle (points)", "Hausse dette / capitaux propres (x)", "Baisse du flux disponible (%)", "Nouveau rapport officiel"],
    kpiLabels: ["Règles totales", "Stockées localement", "Actives", "Évaluées toutes les 30 s", "Déclenchées", "Dernière évaluation", "Indisponibles", "Sources temporaires", "Actives", "Locales", "Navigateur autorisé", "Affichage dans la page"],
    statusLabels: ["Déclenchée", "Surveillance", "Indisponible", "En attente", "Désactivée"],
    errorLabels: ["Évaluation des alertes indisponible.", "Entre un symbole et un seuil valide (0–100).", "Entre un symbole et un seuil numérique valide."],
    permissionLabels: ["Notifications actives", "Notifications refusées", "Non supportées", "Activer les notifications"],
    actionLabels: ["Vérification…", "Vérifier maintenant", "Désactiver", "Activer", "Supprimer l’alerte", "Ouvrir Focus", "Demander à l’Assistant", "Document source"],
  },
  en: {
    intro: "Monitor market thresholds and verifiable official financial changes. Local rules are evaluated while this section is open.",
    createHint: "Browser notifications are optional; this page always shows each rule’s state.",
    scope: "rules are evaluated while this page is open. Continuous server monitoring requires a user account and persistent database.",
    sectionHint: "A triggered alert does not repeatedly send the same notification.",
    emptyHint: "Create your first price, RSI, or Anatole score threshold.",
    metricLabels: ["Price", "Daily change (%)", "RSI 14", "20-session momentum (%)", "Relative volume (x)", "Anatole score"],
    eventLabels: ["Operating margin drop (points)", "Debt / equity rise (x)", "Free cash flow drop (%)", "New official report"],
    kpiLabels: ["Total rules", "Stored locally", "Active", "Evaluated every 30 s", "Triggered", "Latest evaluation", "Unavailable", "Temporary sources", "Enabled", "Local", "Browser allowed", "Displayed on page"],
    statusLabels: ["Triggered", "Monitoring", "Unavailable", "Pending", "Disabled"],
    errorLabels: ["Alert evaluation is unavailable.", "Enter a symbol and a valid threshold (0–100).", "Enter a symbol and a valid numeric threshold."],
    permissionLabels: ["Notifications enabled", "Notifications denied", "Unsupported", "Enable notifications"],
    actionLabels: ["Checking…", "Check now", "Disable", "Enable", "Delete alert", "Open Focus", "Ask the Assistant", "Source document"],
  },
};

export default function AlertesPage() {
  return <AlertsClient copy={copy} />;
}
