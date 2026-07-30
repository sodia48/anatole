# Déploiement Anatole v0.7.7

## Installation

Décompressez `Anatole_Mobile_Terminal_v0_7_7_PATCH.zip` à la racine du dépôt
et acceptez les remplacements.

## 1. Render

Déployez l'API en premier, puis vérifiez :

```text
https://anatole-api.onrender.com/health
https://anatole-api.onrender.com/api/v1/analysis/terminal
https://anatole-api.onrender.com/api/v1/market/cockpit?universe=tsx60
https://anatole-api.onrender.com/api/v1/market/cockpit?universe=composite
```

## 2. Vercel

Déployez ensuite le frontend avec `Use existing Build Cache` désactivé pour
ce premier déploiement.

## 3. Tests mobiles

Dans `/cockpit` :

1. vérifiez les boutons TSX 60 et Composite;
2. ouvrez le Composite;
3. essayez les modes Secteurs, Marché et Direction;
4. sélectionnez une petite case;
5. ouvrez le mode focus;
6. vérifiez qu'aucun titre n'est supprimé.

Dans `/terminal` :

1. changez les onglets Tous, Volume, Momentum et Sous pression;
2. filtrez par secteur;
3. ouvrez une carte dans Focus;
4. développez les détails avancés.

Aucune nouvelle variable d'environnement n'est requise.
