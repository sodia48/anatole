# Déploiement Anatole v0.7.6

## 1. Installer

Décompressez `Anatole_TSX_Composite_v0_7_6_PATCH.zip` à la racine du dépôt,
puis acceptez les remplacements.

## 2. Déployer Render en premier

Après le déploiement, vérifiez :

```text
https://anatole-api.onrender.com/health
https://anatole-api.onrender.com/api/v1/market/cockpit?universe=tsx60
https://anatole-api.onrender.com/api/v1/market/cockpit?universe=composite
```

Le premier chargement du Composite peut demander quelques secondes, car la
liste élargie et ses cotations doivent être réchauffées.

## 3. Déployer Vercel

Redéployez ensuite le frontend avec **Use existing Build Cache désactivé**.

## 4. Test fonctionnel

Dans `/cockpit` :

1. sélectionnez `TSX 60`;
2. vérifiez 60 titres;
3. sélectionnez `Composite`;
4. vérifiez que le titre devient `S&P/TSX Composite`;
5. vérifiez que le nombre de titres est supérieur à 150;
6. revenez au TSX 60;
7. rechargez la page et confirmez que le dernier univers choisi est conservé.
