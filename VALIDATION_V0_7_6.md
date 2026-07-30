# Validation Anatole v0.7.6

## Backend

- Suite FastAPI complète : **79 tests réussis, 0 échec**.
- Route TSX 60 : testée en HTTP 200.
- Route Composite : testée en HTTP 200 avec 180 composantes simulées.
- Univers inconnu : HTTP 400.
- Cinq cotations manquantes : les 180 composantes restent présentes et cinq
  cases sont marquées `unavailable`.
- Lecture de la date « Fund Holdings as of » : validée.
- Repli sur la dernière liste Composite lors d'une panne de source : validé.
- Compilation Python des fichiers modifiés : réussie.

## Frontend

Contrôle syntaxique TypeScript réussi pour :

- `CockpitClient.tsx`;
- `MarketHeatmap.tsx`;
- `AppTopbar.tsx`;
- `AppSidebar.tsx`;
- `api.ts`;
- `refresh.ts`.

Le heatmap v0.7.2 est conservé. Seuls son titre dynamique et l'affichage
neutre `N/D` des cotations indisponibles ont été ajoutés.

## CSS

- `globals.css` : accolades équilibrées;
- `mobile.css` : accolades équilibrées;
- `MarketHeatmap.module.css` : accolades équilibrées.

## Limite de validation

Le build Next.js complet n'a pas pu être exécuté dans cet environnement, car
les modules `next`, `react` et leurs types ne sont pas installés localement.
Les composants modifiés passent néanmoins le compilateur TypeScript en mode
transpilation stricte. Vercel exécutera le build définitif.
