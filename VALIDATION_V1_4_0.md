# Validation statique Anatole v1.4.0

Ce paquet a été construit de façon additive afin de ne pas écraser v1.3.9.

Contrôles effectués localement :

- compilation Python des 3 nouveaux fichiers backend;
- présence des 10 provinces;
- normalisation FR/EN des noms provinciaux;
- endpoint isolé sous `/api/v1/discovery/provincial-statistics`;
- composant frontend autonome, sans modification de `lib/api.ts`;
- CSS responsive avec grille 4 → 2 → 1 colonne;
- aucune clé API requise;
- aucune migration PostgreSQL;
- archive ZIP et SHA-256 générés.

Limite de validation :

L'environnement de génération n'a pas d'accès réseau sortant direct pour
exécuter les appels POST WDS en conditions réelles. La structure des appels est
fondée sur la documentation WDS officielle de Statistique Canada. La validation
réseau finale doit être faite après déploiement Render avec l'endpoint Québec,
puis `region=all`.
