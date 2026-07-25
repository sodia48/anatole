# Anatole Signature Mobile v4.2 — ETF Black Canvas Hotfix

## Cause corrigée

La version v4.1 attendait que `ResizeObserver` fournisse une largeur et une
hauteur avant de calculer les groupes. Si cette mesure restait à `0 × 0`
pendant l’hydratation mobile, le fond de la heatmap était visible mais aucun
groupe ni ETF n’était rendu.

La v4.2 n’utilise plus `ResizeObserver`. Le calcul possède immédiatement un
viewport mobile ou ordinateur valide, puis positionne les groupes en
pourcentages. La carte ne peut donc plus rester vide et noire à cause d’une
mesure absente.

## Fichiers à remplacer / ajouter

- REMPLACER :
  `apps/web/components/etf/EtfHeatmap.tsx`

- AJOUTER :
  `apps/web/components/etf/EtfHeatmap.module.css`

Le nouveau composant importe son propre module CSS. Il ne dépend plus du CSS
du Cockpit pour fonctionner.

## Résultat

- tous les ETF filtrés sont affichés;
- aucun sélecteur 50/100 ne limite les titres;
- même structure visuelle que la heatmap du Cockpit;
- toute la surface disponible est utilisée;
- aucun canevas vide pendant l’hydratation;
- fonctionnement mobile et ordinateur conservé;
- aucun changement FastAPI ou Render.

## Déploiement

1. Copier les deux fichiers aux chemins exacts.
2. Commit et push.
3. Vercel → Redeploy.
4. Désactiver `Use existing Build Cache`.
5. Sur iPhone, fermer totalement Safari puis rouvrir `/etf`.
