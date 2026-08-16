# Validation — Anatole v1.5.1

## Backend

Commande exécutée :

```bash
cd apps/api
PYTHONPATH=. pytest -q tests/test_provincial_macro.py
```

Résultat :

```text
12 passed
```

Couverture des tests :

- les 10 provinces sont enregistrées;
- alias français/anglais des provinces;
- rejet du bruit non économique;
- classification des indicateurs essentiels;
- lecture du calendrier Statistique Québec;
- lecture des échéances Ontario Economic Accounts;
- calendrier Saskatchewan;
- élimination des événements nationaux non provincialisables;
- secours Québec daté;
- nettoyage/traduction des titres StatCan;
- commerce de gros comme indicateur provincialisable;
- chemin rapide `/provincial-calendar` combinant source provinciale + volet provincial StatCan.

## Frontend TypeScript

Les nouveaux modules frontend ont été vérifiés avec TypeScript 5.8.3 dans un projet de contrôle avec alias `@/*`, déclarations CSS Modules et DOM :

```text
tsc --noEmit : réussi
```

## Installateur automatique

L'installateur a été testé deux fois de suite sur un dépôt Next.js/FastAPI synthétique :

- première exécution : route FastAPI ajoutée + composant Calendrier identifié + panneau injecté;
- deuxième exécution : aucune duplication; intégration reconnue comme déjà installée.

Le test a aussi vérifié que l'injection se fait dans la racine JSX du composant et non à l'intérieur d'un titre ou d'un contrôle.

## Sources officielles vérifiées le 16 août 2026

### Québec

Calendrier de diffusion des principaux indicateurs économiques :

https://statistique.quebec.ca/fr/produit/tableau/calendrier-de-diffusion-principaux-indicateurs-economiques

### Ontario

Ontario Budget 2026 — Chapter 2, calendrier des Ontario Economic Accounts :

https://budget.ontario.ca/2026/chapter-2.html

### Saskatchewan

Bureau of Statistics — 2026-27 Release Schedule :

https://publications.saskatchewan.ca/api/v1/products/86689/formats/156260/download

### Statistique Canada

Le service de calendrier déjà présent dans Anatole reste utilisé comme filet de sécurité, mais seulement pour les indicateurs pouvant réellement être ventilés par province.

## Limite volontaire

Le correctif ne prétend pas qu'un événement national est provincial simplement parce qu'il a un effet économique général. Une vue provinciale doit montrer une donnée qui vise directement la province ou une diffusion nationale avec une vraie composante provinciale.
