# Validation Anatole v0.8.0

## Backend

- compilation Python de `app` et `tests` : réussie;
- suite FastAPI : **83 tests réussis, 0 échec**;
- `/health` : HTTP 200;
- `/ready` : HTTP 200 avec métriques upstream et fiabilité;
- `/api/v1/reliability/status` : HTTP 200;
- `/api/v1/workspace/data-quality` : HTTP 200;
- `/api/v1/reliability/feedback` : HTTP 202 et référence `AN-...`;
- validation 422 d'un message trop court : réussie;
- événement navigateur : HTTP 202;
- en-têtes `X-Request-ID` et `X-Anatole-Version: 0.8.0` : validés.

## Frontend

Contrôle syntaxique TypeScript par `transpileModule` sur 16 fichiers modifiés
ou ajoutés : **0 erreur de syntaxe**.

Les 14 feuilles CSS du frontend ont des accolades équilibrées.

Les manifests JSON et le workflow YAML ont été analysés sans erreur de
structure.

## Tests automatisés ajoutés

- tests API Playwright pour 7 routes critiques;
- parcours Cockpit, Screener, ETF, Focus, Terminal et Qualité;
- contrôle du débordement horizontal pour chaque route;
- contrôle du sélecteur TSX 60 / Composite;
- contrôle d'ouverture du formulaire de signalement;
- projets Desktop Chromium et Mobile WebKit.

## Limite de validation locale

`pnpm` et les dépendances Next.js n'étaient pas installés dans l'environnement
de génération. Le vrai `pnpm typecheck`, le `next build` et l'exécution des
navigateurs Playwright n'ont donc pas été lancés localement.

Le workflow GitHub inclus est conçu pour exécuter ces trois étapes dans un
environnement CI propre avant la mise en production.
