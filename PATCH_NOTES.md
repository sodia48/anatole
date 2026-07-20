# Correctif Anatole — Actualités officielles

## Fichier obligatoire à remplacer

`apps/api/app/services/news.py`

## Fichier de tests facultatif à ajouter

`apps/api/tests/test_news_service.py`

## Changements appliqués

- Un seul téléchargement du flux officiel « Tous les sujets » de Statistique Canada, puis classement local dans les quatre catégories affichées par Anatole.
- Parsing RSS et Atom compatible avec les espaces de noms XML.
- Choix prioritaire du lien Atom `rel="alternate"`.
- Détection des réponses HTML, XML invalides et flux vides.
- Trois tentatives pour les erreurs réseau temporaires et les codes 429/5xx.
- Délais réseau adaptés à Render.
- Conservation des dernières bonnes publications quand une source devient temporairement indisponible.
- Cache vide limité à 60 secondes au lieu de 15 minutes.
- Journalisation utile pour les diagnostics Render.
- Aucune donnée fictive, aucune API payante et aucune nouvelle variable d’environnement.

## Déploiement

Après l’ajout sur la branche `main`, Render devrait redéployer automatiquement `anatole-api`. Sinon, lancer `Manual Deploy` puis `Deploy latest commit`.

Test final : ouvrir `https://anatole-api.onrender.com/api/v1/discovery/news`, puis vérifier que `items` contient des publications officielles.
