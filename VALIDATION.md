# Validation du correctif

Contrôles exécutés lors de la création du paquet :

- compilation syntaxique de tous les fichiers Python;
- vérification des imports relatifs du correctif;
- présence du client HTTP partagé;
- concurrence Yahoo globale limitée à 6;
- cache quote frais de 25 secondes;
- stale-if-error quote de 30 minutes;
- ETF : lots de 8, rafraîchissement complet de 5 minutes;
- WebSocket : 15 secondes au lieu de 5;
- health check local sans dépendance Yahoo;
- retry frontend sur 429/502/503/504.

Après déploiement, surveiller dans Render :

- `request_finished ... status=... duration_ms=...`
- `cf_ray=...`
- absence de `SIGKILL`, `MemoryError`, `WORKER TIMEOUT`;
- `peak_active` dans `/ready` qui ne doit pas dépasser 6 pour l'upstream.
