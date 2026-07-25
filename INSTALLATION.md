# Anatole Signature Mobile v3

Cette version remplace les anciens correctifs mobiles injectés dans le
composant Sidebar. Le CSS mobile est maintenant importé directement après
`globals.css`, ce qui lui donne la priorité réelle dans Next.js.

## Fichiers à remplacer

- `apps/web/app/layout.tsx`
- `apps/web/components/layout/AppSidebar.tsx`
- `apps/web/components/cockpit/MarketHeatmap.tsx`
- `apps/web/components/cockpit/MarketHeatmap.module.css`

## Fichier à ajouter

- `apps/web/app/mobile.css`

## Fichier à supprimer

Si ce fichier existe encore, il faut le supprimer :

- `apps/web/components/layout/MobileDesktopParity.tsx`

Le nouveau `AppSidebar.tsx` ne l’importe plus.

## Résultat mobile

- barre Anatole fixe et compacte au sommet;
- tiroir latéral réellement aligné, sans espace vide;
- logo, recherche et navigation placés dans le bon ordre;
- tous les intitulés lisibles;
- quatre KPI en grille 2 × 2;
- Focus en colonne complète;
- tableaux avec défilement horizontal local;
- nouvelles inscriptions en cartes mobiles;
- nouvelle heatmap binaire responsive;
- les 60 titres et tous les secteurs restent dans la largeur du téléphone;
- aucun canvas de 720 ou 980 pixels;
- aucune heatmap déformée ou rognée.

## Déploiement

1. Respecter exactement les chemins.
2. Supprimer l’ancien `MobileDesktopParity.tsx` si présent.
3. Commit et push sur la branche de production.
4. Vercel → Redeploy.
5. Désactiver `Use existing Build Cache`.
6. Sur iPhone : Réglages Safari → Avancé → Données de sites →
   rechercher `anatole-mu.vercel.app` → supprimer.
7. Ouvrir de nouveau `/cockpit`.

Aucun changement Render/FastAPI n’est requis.
