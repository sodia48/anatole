# Anatole mobile responsive v2

Cette version corrige directement les deux problèmes visibles sur iPhone :

1. le tiroir latéral n'est plus décalé ni coupé;
2. le cockpit ne force plus des sections de 720 à 1 010 pixels dans un
   écran d'environ 390 pixels.

## Fichiers à remplacer

- `apps/web/components/layout/AppSidebar.tsx`
- `apps/web/components/layout/MobileDesktopParity.tsx`
- `apps/web/components/cockpit/MarketHeatmap.tsx`
- `apps/web/components/cockpit/MarketHeatmap.module.css`
- `apps/web/components/etf/EtfHeatmap.tsx`
- `apps/web/components/ipo-insiders/IpoInsiders.module.css`

Les copies sous `components/layout/` sont également incluses pour garder
synchronisées les deux arborescences déjà présentes dans le dépôt.

## Résultat attendu sur téléphone

- logo Anatole en haut du tiroir;
- barre de recherche sous le logo;
- navigation verticale complète, sans noms tronqués;
- bouton de fermeture dans le tiroir;
- quatre KPI affichés en grille 2 × 2;
- heatmap TSX 60 entièrement contenue dans la largeur du téléphone;
- tous les secteurs affichés dans une grille compacte;
- meilleures variations, baisses et contribution sectorielle empilées;
- Focus en une colonne avec le graphique pleine largeur;
- ETF redimensionné dans la largeur disponible;
- IPO et Initiés en cartes mobiles lisibles;
- seuls les tableaux détaillés utilisent un défilement horizontal local.

## Déploiement

1. Remplacer les fichiers dans GitHub.
2. Commit et push sur la branche de production.
3. Vercel → Redeploy.
4. Désactiver `Use existing Build Cache`.
5. Sur iPhone, fermer l'ancien onglet ou vider les données du site.
6. Ouvrir de nouveau `https://anatole-mu.vercel.app/cockpit`.

Aucun redéploiement Render n'est requis.
