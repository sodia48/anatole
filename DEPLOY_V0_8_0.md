# Déploiement Anatole v0.8.0

## 1. Installer le PATCH

Décompresser `Anatole_Production_Reliability_v0_8_0_PATCH.zip` à la racine du
dépôt puis accepter les remplacements et nouveaux fichiers.

## 2. Déployer Render en premier

Après le déploiement, vérifier :

```text
https://anatole-api.onrender.com/health
https://anatole-api.onrender.com/ready
https://anatole-api.onrender.com/api/v1/reliability/status
https://anatole-api.onrender.com/api/v1/workspace/data-quality
```

Chaque réponse doit être HTTP 200 et contenir l'en-tête `X-Request-ID`, sauf
si un proxy externe le retire.

## 3. Déployer Vercel

Conserver :

```text
ANATOLE_API_URL=https://anatole-api.onrender.com
NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com
```

Redéployer avec `Use existing Build Cache` désactivé pour cette première
installation.

## 4. Activer le quality gate GitHub

Le workflow `.github/workflows/quality-gate.yml` démarre automatiquement sur
les pull requests et les push vers `main`.

Il installe Playwright et ses navigateurs, démarre FastAPI en mode démonstration
et Next.js localement, puis teste les parcours critiques.

## 5. Contrôle manuel après déploiement

1. Ouvrir `/cockpit` sur téléphone et ordinateur.
2. Passer du TSX 60 au Composite.
3. Ouvrir Screener, ETF, Focus et Terminal Pro.
4. Ouvrir `/qualite` et vérifier les métriques API 5xx et p95.
5. Utiliser « Signaler un problème » et noter la référence `AN-...`.
6. Retrouver cette référence dans les logs Render.
7. Simuler le mode hors ligne après avoir chargé une section et vérifier que
   la bannière « Mode résilient » apparaît.

## Retour arrière

Le PATCH n'ajoute aucune migration de base de données. Un rollback Render et
une promotion du déploiement Vercel précédent suffisent.
