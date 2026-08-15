# Validation Anatole v1.3.9

- Python compile : OK
- Tests backend ciblés : 30 passed
- TypeScript / TSX syntax : OK sur 5 fichiers
- 10 provinces + Canada disponibles : OK
- Détection des noms français et anglais : OK
- Détection des abréviations provinciales : OK
- Indicateurs à ventilation provinciale : OK
- Publications nationales conservées dans une vue provinciale : OK
- Sources provinciales directes limitées dans le temps : OK
- Édition française protégée contre l'injection de flux provinciaux anglais : OK
- Traductions des nouvelles catégories provinciales : OK
- Archive ZIP : vérifiée

Note :
Un test d'intégration global du vieux snapshot de travail échoue sur le Screener
à cause d'un décalage préexistant entre la route Screener et son service dans
cette copie de développement. Aucun fichier Screener n'est inclus ni modifié
par ce PATCH. Les 30 tests propres à Actualités, Calendrier et Régions passent.
