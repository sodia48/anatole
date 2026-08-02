# Anatole v0.9.5 — correction du build ETF

## Cause

Le dépôt contient un dossier dupliqué :

`apps/web/components/components/etf`

Le composant exécuté depuis ce dossier interprétait l'import relatif
`../../lib/etf-holdings-api` comme `apps/web/components/lib/...`, qui n'existe
pas.

## Correction

- imports remplacés par les alias stables `@/lib` et `@/components`;
- fichier `etf-holdings-api.ts` inclus au bon emplacement;
- page ETF redirigée vers le composant canonique;
- shim de compatibilité ajouté dans le dossier dupliqué;
- dossier `components/components` exclu du contrôle TypeScript;
- aucun changement au backend ou aux données ETF.

## Installation

Décompressez le PATCH à la racine du dépôt et acceptez les remplacements.

Vérifiez notamment ces chemins :

- `apps/web/lib/etf-holdings-api.ts`
- `apps/web/components/etf/EtfPerformanceChart.tsx`
- `apps/web/app/etf/[ticker]/page.tsx`

Puis committez et redéployez uniquement Vercel avec
`Use existing Build Cache` désactivé.

Le dossier dupliqué `apps/web/components/components` pourra être supprimé
plus tard, mais il ne bloquera plus le build.
