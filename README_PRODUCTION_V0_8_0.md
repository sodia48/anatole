# Anatole v0.8.0 — Fiabilité production et bêta privée

Cette version ne crée pas une nouvelle section de marché. Elle rend les
fonctions déjà présentes plus sûres à déployer, plus faciles à diagnostiquer
et moins susceptibles d'afficher un écran vide pendant une panne temporaire.

## Ce qui est ajouté

### Traçabilité de bout en bout

Chaque requête reçoit un `X-Request-ID` transmis par Next.js à FastAPI puis
renvoyé dans la réponse. Les logs Render affichent le même identifiant.

Le backend mesure aussi, pour le processus courant :

- le nombre total de requêtes;
- les réponses 4xx et 5xx;
- les exceptions non gérées;
- la latence moyenne et p95;
- les requêtes supérieures à 2,5 secondes;
- les incidents récents avec route et identifiant.

Nouvelle route :

```text
/api/v1/reliability/status
```

### Dernière donnée valide

Pour les requêtes GET en JSON, le navigateur conserve la dernière réponse
valide de la session. Après une erreur réseau, 500, 502, 503 ou 504, Anatole
peut afficher cette réponse pendant au plus 30 minutes au lieu de remplacer
la section par un écran vide.

Une bannière « Mode résilient » informe clairement l'utilisateur que les
données affichées proviennent du dernier chargement valide.

Les routes `/health` et `/api/v1/reliability/status` ne sont jamais servies
depuis ce cache de secours.

### Signalement bêta intégré

Un bouton discret « Signaler un problème » est disponible dans toute
l'application. Il enregistre dans les logs opérationnels :

- la description fournie;
- la section et la route;
- la taille de l'écran et le navigateur, avec consentement;
- le dernier `X-Request-ID`;
- une référence de suivi de type `AN-XXXXXXXXXX`.

Le portefeuille, les quantités, les coûts moyens et le profil Anatole Conseil
ne sont jamais joints au signalement.

### Instrumentation du navigateur

Les erreurs JavaScript non gérées, les promesses rejetées et les navigations
très lentes sont envoyées au journal d'incidents sans bloquer l'interface.

### Qualité des données enrichie

La section `/qualite` affiche maintenant :

- le taux HTTP 5xx de FastAPI;
- la latence p95;
- le nombre de requêtes lentes;
- le nombre de signalements bêta;
- les six incidents serveur les plus récents avec leur `X-Request-ID`.

### Quality gate de déploiement

Le workflow GitHub Actions exécute :

1. les tests FastAPI;
2. le contrôle TypeScript;
3. le build Next.js;
4. les parcours Playwright sur ordinateur et Safari mobile simulé.

Les parcours critiques couvrent Cockpit, Screener, ETF, Focus, Terminal Pro,
Qualité des données, l'absence de débordement horizontal et le formulaire de
signalement.

## Limites volontaires

- Les métriques de fiabilité sont en mémoire et repartent à zéro lorsque
  Render redémarre le processus.
- Les signalements sont enregistrés dans les logs Render; ils ne sont pas
  encore stockés dans PostgreSQL.
- Les comptes, la synchronisation multiappareil et les alertes serveur restent
  prévus pour la v0.9.
