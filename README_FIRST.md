# Anatole v1.3.4 — Screener TSX Composite

## Nouveau comportement

Le Screener utilise désormais le S&P/TSX Composite par défaut.

L’utilisateur peut choisir :

- TSX Composite : univers canadien élargi;
- TSX 60 : vue rapide des grandes capitalisations.

Le score Anatole conserve les mêmes composantes :

- variation de la séance;
- momentum sur 20 séances;
- volume relatif;
- RSI;
- tendance technique.

## Univers Composite

La liste opérationnelle provient des positions publiées pour XIC, qui réplique
le S&P/TSX Capped Composite. Les espèces et dérivés sont exclus. Le service
utilise jusqu’à 260 sociétés et conserve la dernière liste valide lorsque la
source est momentanément indisponible.

## Performance

- cache TSX 60 : 45 secondes;
- cache Composite : 180 secondes;
- délai frontend Composite : 120 secondes;
- calcul des historiques Composite avec concurrence contrôlée;
- changement d’univers sans perdre les filtres généraux.

Le premier calcul Composite peut être plus long que le TSX 60. Les visites
suivantes bénéficient du cache backend.

## Déploiement

1. Installer le PATCH à la racine du dépôt.
2. Commit et push sur `main`.
3. Déployer Render en premier.
4. Déployer Vercel sans réutiliser le Build Cache.

Aucune migration PostgreSQL n’est requise.
