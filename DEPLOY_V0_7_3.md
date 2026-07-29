# Déploiement Anatole v0.7.3

## 1. Installer le PATCH

Décompresser `Anatole_Mobile_Professional_v0_7_3_PATCH.zip` à la racine du dépôt.

Les fichiers remplacés sont exclusivement dans `apps/web` : aucun changement backend n’est requis.

## 2. Commit

Exemple :

```text
Upgrade professional mobile navigation and complete heatmaps
```

## 3. Déployer Vercel

- pousser le commit sur `main`;
- ouvrir Vercel > Deployments;
- lancer un nouveau déploiement;
- désactiver `Use existing Build Cache` pour ce premier déploiement.

Render n’a pas besoin d’être redéployé pour ce PATCH, puisque les routes et services FastAPI ne changent pas.

## 4. Tests téléphone

Tester au minimum :

```text
/cockpit
/etf
/etf/XIC
/screener
/comparateur
/terminal
/portefeuille
/alertes
/assistant
/qualite
```

Dans `/cockpit`, vérifier que chaque titre affiche un symbole et une variation.

Dans `/etf`, vérifier que le compteur de la page correspond au nombre de cases affichées dans les groupes lorsque les filtres sont sur `Tous`.

## 5. Retour arrière

En cas de problème, promouvoir le déploiement Vercel précédent. Aucun changement de données ni migration n’est associé à cette version.
