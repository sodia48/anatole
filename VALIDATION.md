# Rapport de validation — Anatole Operational Final v1

## Backend

- Compilation Python de `apps/api/app` et `apps/api/tests` : réussie.
- Suite complète : **59 tests réussis, 0 échec**.
- Vérification OpenAPI : les six routes opérationnelles sont enregistrées :
  Screener, répertoire ETF, participations ETF, historique ETF, IPO et initiés.
- Smoke test FastAPI en mode de données de secours :
  - `/health` : 200;
  - `/api/v1/discovery/screener?universe=tsx60` : 200, 60 titres;
  - `/api/v1/discovery/etfs` : 200, 172 ETF;
  - `/api/v1/discovery/psychology` : 200, 5 composantes.
- Tests de routes avec services isolés : participations ETF, historique ETF,
  IPO et initiés répondent tous 200.

## Frontend

- Vérification statique TypeScript de l’ensemble de `apps/web` avec les modules
  externes simulés : réussie.
- Présence vérifiée de tous les exports consommés par les composants :
  `getHealthStatus`, Cockpit, Watchlist, Focus, Screener, Actualités,
  Calendrier, Psychologie, ETF, Recherche et WebSocket.
- Méthode Watchlist restaurée en POST.
- Relais same-origin `/api/anatole` vérifié dans `next.config.ts`.

## Limite de l’environnement de validation

Le build Next.js réel n’a pas pu être exécuté ici, car l’environnement ne
pouvait pas télécharger `pnpm` et les dépendances npm à cause d’un échec DNS
vers le registre. Cette limite est distincte du code. La vérification statique
a néanmoins détecté puis permis de corriger l’export frontend qui cassait le
build précédent.

La récupération réelle des compositions ETF dépend de la réponse de la source
publique au moment du test après déploiement Render. Le service renvoie une
réponse structurée et conserve les dernières données valides en cas d’échec.
