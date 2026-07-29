# Validation Anatole v0.7.3

## Backend inchangé

- suite racine : `9 passed`;
- suite FastAPI complète : `75 passed`;
- aucun fichier Python métier modifié.

## TypeScript

Les fichiers modifiés ont passé :

- transpilation TypeScript avec diagnostics;
- contrôle sémantique strict isolé avec TypeScript 5.8.3;
- vérification des types des événements du tiroir et de la recherche.

Fichiers contrôlés :

```text
apps/web/app/layout.tsx
apps/web/app/providers.tsx
apps/web/components/layout/AppSidebar.tsx
apps/web/components/cockpit/MarketHeatmap.tsx
apps/web/components/etf/EtfHeatmap.tsx
```

## CSS

`tinycss2` n’a détecté aucune erreur dans :

```text
apps/web/app/mobile.css
apps/web/components/layout/AppSidebarGuard.module.css
apps/web/components/cockpit/MarketHeatmap.module.css
apps/web/components/etf/EtfHeatmap.module.css
```

Les nombres d’accolades ouvrantes et fermantes correspondent dans les quatre fichiers.

## Garde-fous vérifiés

- le dock mobile est masqué sur ordinateur par le CSS module de sécurité;
- la barre mobile et le tiroir restent masqués sur ordinateur;
- le zoom utilisateur n’est plus bloqué par `maximumScale: 1`;
- la carte mobile des actions parcourt `group.tiles` sans troncature;
- la carte mobile des ETF parcourt `group.items` sans troncature;
- symbole et variation sont rendus dans chaque case;
- la treemap ordinateur reste inchangée et n’est masquée qu’à moins de 821 px;
- le dock respecte `env(safe-area-inset-bottom)`;
- le contenu principal réserve l’espace nécessaire au dock.

## Limite de validation

Le véritable `next build` n’a pas pu être exécuté dans cet environnement : le registre npm interne renvoyait HTTP 404 pour `@types/node`. Vercel exécutera le build complet avec les dépendances du projet. L’échec n’est pas lié au code du PATCH.
