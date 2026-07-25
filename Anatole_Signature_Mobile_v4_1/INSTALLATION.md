# Anatole Signature Mobile v4.1

## Correction ciblée depuis v4

Remplacer uniquement :

```text
apps/web/app/mobile.css
apps/web/components/etf/EtfHeatmap.tsx
```

Le nouveau composant ETF réutilise volontairement :

```text
apps/web/components/cockpit/MarketHeatmap.module.css
```

Ce fichier est déjà inclus dans le ZIP complet v4.1 et doit rester à son chemin.

## Installation complète

Le ZIP contient aussi les fichiers stables de v4 :

```text
apps/web/app/layout.tsx
apps/web/app/providers.tsx
apps/web/components/layout/AppSidebar.tsx
apps/web/components/cockpit/MarketHeatmap.tsx
apps/web/components/cockpit/MarketHeatmap.module.css
```

## Déploiement

1. Copier les fichiers en respectant exactement les chemins.
2. Commit et push sur la branche reliée à Vercel.
3. Vercel → Redeploy.
4. Désactiver **Use existing Build Cache**.
5. Sur iPhone, fermer puis rouvrir Safari. Si l'ancienne version reste visible,
   supprimer les données du site `anatole-mu.vercel.app` dans les réglages Safari.

Aucune modification Render ou FastAPI n'est nécessaire.
