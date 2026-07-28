# Anatole v0.6 — Comparateur et Terminal Pro

## Fonctionnalités livrées

### Comparateur

- Deux à cinq actions ou ETF.
- Périodes : 1 mois, 3 mois, 6 mois, YTD, 1 an, 3 ans et 5 ans.
- Performance normalisée base 100.
- Rendement total et annualisé.
- Volatilité annualisée, bêta TSX, drawdown maximal et ratio de Sharpe.
- Momentum 20 jours, RSI, tendance et volume relatif.
- Valorisation disponible : capitalisation, P/E, P/B et dividende.
- Score Anatole, classement, forces et points de vigilance.
- Matrice de corrélation.
- Commande de recherche : `comparer RY et TD`.

### Terminal Pro

- Régime de marché et score sur 100.
- Niveau de risque.
- Largeur du TSX 60.
- Part des titres au-dessus des moyennes mobiles 20 et 50 séances.
- Rotation sectorielle et score de leadership.
- Radar d’opportunités.
- Alertes prix-volume, extensions RSI et dislocations.
- Classement des leaders et des titres sous pression.
- Rafraîchissement automatique avec conservation du dernier snapshot valide.

## Routes FastAPI ajoutées

```text
POST /api/v1/analysis/compare
GET  /api/v1/analysis/terminal
```

Exemple Comparateur :

```json
{
  "symbols": ["RY", "TD", "SHOP"],
  "range": "1y"
}
```

## Déploiement

1. Copier le patch à la racine du dépôt et accepter les remplacements.
2. Commit et push sur `main`.
3. Déployer Render en premier.
4. Vérifier :

```text
https://anatole-api.onrender.com/health
https://anatole-api.onrender.com/api/v1/analysis/terminal
```

5. Tester le Comparateur avec une requête POST ou via l’interface.
6. Déployer Vercel sans réutiliser l’ancien Build Cache.
7. Tester `/comparateur` et `/terminal` sur ordinateur et mobile.

## Variables

Aucune nouvelle clé API n’est requise. Conserver :

```text
NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com
ANATOLE_API_URL=https://anatole-api.onrender.com
```

## Charge API

- Comparateur : cinq titres maximum, cache de cinq minutes.
- Terminal Pro : réutilise les caches Screener et Cockpit, cache de soixante secondes.
- Les historiques sont chargés en lot avec une concurrence bornée.
- Les fondamentaux sont limités à trois chargements simultanés et à douze secondes par titre.
- Les ETF ne déclenchent pas la récupération de fondamentaux d’entreprise.
