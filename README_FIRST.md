# Anatole — Emergency Fix v4.2.1

Ce correctif restaure le shell Anatole et conserve la nouvelle heatmap ETF.

## Cause visible sur la capture

La barre mobile brute (`☰ Anatole Cockpit 🔍`) et l'en-tête du tiroir apparaissent sur ordinateur uniquement lorsque la couche `apps/web/app/mobile.css` n'est plus chargée correctement, a été écrasée, ou reste servie depuis un cache incohérent.

La heatmap ETF n'est pas la cause directe de cet écran.

## Remplacement exact

Copier le contenu du dossier `apps/` à la racine du dépôt et remplacer les fichiers existants :

- `apps/web/app/layout.tsx`
- `apps/web/app/providers.tsx`
- `apps/web/app/mobile.css`
- `apps/web/components/layout/AppSidebar.tsx`
- `apps/web/components/layout/AppSidebarGuard.module.css` (nouveau)
- `apps/web/components/etf/EtfHeatmap.tsx`
- `apps/web/components/etf/EtfHeatmap.module.css`

Ne renommer aucun fichier et ne déplacer aucun `.module.css` dans `apps/web/app`.

## Vérification avant déploiement

Dans `apps/web/app/layout.tsx`, l'ordre doit rester :

```ts
import "./globals.css";
import "./mobile.css";
```

Dans `EtfHeatmap.tsx`, l'import doit rester :

```ts
import styles from "./EtfHeatmap.module.css";
```

## Déploiement

1. Commit et push.
2. Vercel → Redeploy.
3. Désactiver `Use existing Build Cache`.
4. Après le déploiement, faire un rechargement forcé du navigateur.

Aucun changement Render ou FastAPI.
