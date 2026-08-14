export type AnatoleLanguage =
  | "fr"
  | "en";

export function localeFor(
  language: AnatoleLanguage,
): "fr-CA" | "en-CA" {
  return language === "en"
    ? "en-CA"
    : "fr-CA";
}

export function pick(
  language: AnatoleLanguage,
  french: string,
  english: string,
): string {
  return language === "en"
    ? english
    : french;
}

const NAV_ENGLISH: Record<string, string> = {
  "Marchés": "Markets",
  "Aujourd’hui": "Today",
  "Actualités": "News",
  "Calendrier": "Calendar",
  "IPO & insiders": "IPO & insiders",
  "Analyse": "Analysis",
  "Comparateur": "Comparator",
  "Psychologie": "Psychology",
  "Mon espace": "My workspace",
  "Portefeuille": "Portfolio",
  "Alertes": "Alerts",
  "Compte & paramètres": "Account & settings",
  "Intelligence": "Intelligence",
  "Anatole Conseil": "Anatole Advisor",
  "Administration": "Administration",
  "Console bêta": "Beta console",
};

export function navLabel(
  language: AnatoleLanguage,
  frenchLabel: string,
): string {
  if (language === "fr") {
    return frenchLabel;
  }

  return (
    NAV_ENGLISH[frenchLabel] ??
    frenchLabel
  );
}

const SOURCE_ENGLISH: Record<string, string> = {
  "Banque du Canada": "Bank of Canada",
  "Statistique Canada": "Statistics Canada",
};

const CATEGORY_ENGLISH: Record<string, string> = {
  "Politique monétaire": "Monetary policy",
  "Communiqués": "Press releases",
  "Comptes économiques": "Economic accounts",
  "Travail": "Labour",
  "Commerce international":
    "International trade",
  "Énergie": "Energy",
  "Indicateurs clés": "Key indicators",
  "événements": "events",
  "Tous les sujets": "All topics",
};

export function localizeSource(
  value: string,
  language: AnatoleLanguage,
): string {
  if (language === "fr") {
    return value;
  }

  return value
    .split(" — ")
    .map(
      (part) =>
        SOURCE_ENGLISH[part] ??
        CATEGORY_ENGLISH[part] ??
        part,
    )
    .join(" — ");
}

export function localizeCategory(
  value: string,
  language: AnatoleLanguage,
): string {
  if (language === "fr") {
    return value;
  }

  return (
    CATEGORY_ENGLISH[value] ??
    value
  );
}

export function localizeSentiment(
  value: string,
  language: AnatoleLanguage,
): string {
  if (language === "fr") {
    return value;
  }

  if (value === "Positif") {
    return "Positive";
  }

  if (value === "Négatif") {
    return "Negative";
  }

  if (value === "Neutre") {
    return "Neutral";
  }

  return value;
}

export function localizeImportance(
  value: string,
  language: AnatoleLanguage,
): string {
  if (language === "fr") {
    return value;
  }

  if (value === "Très élevée") {
    return "Very high";
  }

  if (value === "Élevée") {
    return "High";
  }

  if (value === "Moyenne") {
    return "Medium";
  }

  return value;
}

export function cleanRelayMention(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .replace(
      /\s*—\s*relayés?\s+par\s+Vercel/gi,
      "",
    )
    .replace(
      /\s*—\s*relayed\s+(?:through|by)\s+Vercel/gi,
      "",
    )
    .trim();
}

export function localizeFeedDetail(
  value: string | null | undefined,
  language: AnatoleLanguage,
): string {
  const cleaned =
    cleanRelayMention(value);

  if (
    language === "fr" ||
    !cleaned
  ) {
    return cleaned;
  }

  const countItems =
    cleaned.match(
      /^(\d+)\s+éléments$/i,
    );
  if (countItems) {
    return `${countItems[1]} items`;
  }

  const countEvents =
    cleaned.match(
      /^(\d+)\s+événements$/i,
    );
  if (countEvents) {
    return `${countEvents[1]} events`;
  }

  const attempts =
    cleaned.match(
      /^(.+)\saprès\s(\d+)\stentatives$/i,
    );
  if (attempts) {
    return `${attempts[1]} after ${attempts[2]} attempts`;
  }

  const known: Record<string, string> = {
    "Flux vide ou format non reconnu":
      "Empty feed or unrecognized format",
    "Aucune publication pertinente dans le flux officiel":
      "No relevant publication found in the official feed",
    "Calendrier officiel reçu, mais aucun événement futur n’a été extrait":
      "Official calendar received, but no future event could be extracted",
    "Page officielle reçue, mais aucun événement futur n’a été extrait":
      "Official page received, but no future event could be extracted",
    "Source indisponible":
      "Source unavailable",
  };

  return known[cleaned] ?? cleaned;
}
