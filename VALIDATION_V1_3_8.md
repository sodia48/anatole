# Validation v1.3.8

- Compilation Python : OK
- Tests backend ciblés : 26 passed
- Syntaxe TypeScript / TSX : 4 fichiers OK
- Dates françaises `21 août 2026` et `14 août` : testées
- Heure française `10 h 30` : testée
- StatCan FR : test synthétique réussi
- Banque du Canada FR : test synthétique réussi
- Exclusion des jours fériés français : testée
- Classification française des événements : testée
- Cache calendrier FR / EN séparé : vérifié
- `Aujourd’hui` transmet `language` : vérifié
- `Aujourd’hui` efface l’ancien calendrier au changement de langue : vérifié
- Archive ZIP : intègre

Le build Next.js complet reste exécuté par Vercel lors du déploiement.
