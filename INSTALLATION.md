# Répertoire ETF sectoriel Anatole V1

Cette livraison fait passer la section de **30 à 172 ETF** et les
regroupe par secteur/exposition.

## Ajouter

- `apps/api/app/data/etf_catalog.py`
- `apps/web/app/etf/page.module.css`
- `apps/api/tests/test_etf_catalog.py`

## Remplacer

- `apps/api/app/services/etf.py`
- `apps/web/app/etf/page.tsx`

## Comportement

- regroupement par secteur;
- filtre rapide par secteur;
- filtre par fournisseur;
- recherche par ticker, nom, exposition ou région;
- sections ouvrables et refermables;
- grille 3 / 2 / 1 colonnes selon l'écran;
- chargement prioritaire des ETF les plus consultés;
- mise à jour asynchrone du reste des cotations;
- rejet des valeurs de démonstration;
- affichage `N/D` lorsqu'une cotation publique réelle n'est pas disponible.

## Déploiement

1. Ajoute/remplace les fichiers dans GitHub sur `main`.
2. Render → `anatole-api` → **Clear build cache & deploy**.
3. Vérifie `/api/v1/discovery/etfs`.
4. Vercel → redéploie le frontend sans cache.
5. Recharge Anatole avec `Ctrl + Shift + R`.

Aucune nouvelle variable d'environnement n'est nécessaire.

## Vérification attendue

L'endpoint doit retourner au moins 100 éléments. La page `/etf` doit afficher
les groupes sectoriels ainsi que le compteur total.
