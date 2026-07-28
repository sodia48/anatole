# Validation Anatole v0.6

## Backend

- Compilation Python de tous les modules : réussie.
- Suite complète `pytest` : **62 tests réussis, 0 échec**.
- `POST /api/v1/analysis/compare` en mode démo : HTTP 200, 3 instruments, 3 séries et matrice de corrélation.
- `GET /api/v1/analysis/terminal` en mode démo : HTTP 200, régime, 10 secteurs, leaders, laggards, opportunités et alertes.
- Cache Comparateur : 300 secondes.
- Cache Terminal Pro : 60 secondes.
- Historique chargé en lot avec concurrence bornée.
- Fondamentaux limités à trois appels simultanés et douze secondes par titre.

## Frontend

- Vérification TypeScript de l’ensemble de `apps/web` avec TypeScript 5.8.3 : réussie.
- Imports et exports API vérifiés.
- Classes du module CSS vérifiées : aucune classe manquante.
- Équilibre des accolades CSS : 181 ouvertures, 181 fermetures.
- Navigation activée dans Sidebar, Topbar et Command Palette.
- Commande `comparer RY et TD` reliée à `/comparateur`.
- Mise en page responsive intégrée au module CSS.

## Limite de validation

Le véritable `next build` n’a pas pu être lancé dans l’environnement de génération, car Corepack ne pouvait pas télécharger pnpm depuis le registre npm. Le code a toutefois passé la vérification TypeScript statique et les contrôles d’intégrité. Le build final doit être confirmé par Vercel.
