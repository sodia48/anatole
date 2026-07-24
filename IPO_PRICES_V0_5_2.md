# Anatole v0.5.2 — Prix des IPO

## Résultat

Chaque carte IPO affiche désormais l'un des états suivants :

- **Prix IPO final** : prix d'émission officiellement publié;
- **Fourchette indicative** : prix minimum et maximum du prospectus préliminaire;
- **Prix de référence** : hypothèse de prix explicitement présentée comme estimative;
- **Non publié** : aucun prix exploitable n'est encore publié.

## Sources utilisées

### Canada

Anatole ouvre le bulletin officiel TMX de chaque nouvelle inscription de société
et extrait le champ **Issue price per security** ainsi que la devise de négociation.

### États-Unis

Anatole ouvre le dépôt EDGAR, trouve le document principal S-1, S-1/A, F-1,
F-1/A ou 424B4, puis recherche :

- la fourchette de prix préliminaire;
- le prix final de l'offre;
- une valeur seulement estimative, clairement étiquetée comme telle.

## Fichiers à remplacer

- `apps/api/app/schemas/ipo_insiders.py`
- `apps/api/app/services/ipo.py`
- `apps/api/tests/test_ipo_service.py`
- `apps/web/lib/ipo-insiders-api.ts`
- `apps/web/components/ipo-insiders/IpoInsidersClient.tsx`
- `apps/web/components/ipo-insiders/IpoInsiders.module.css`

## Déploiement

1. Remplacer les six fichiers dans GitHub.
2. Render → `anatole-api` → **Clear build cache & deploy**.
3. Vérifier `/api/v1/discovery/ipo` et rechercher les champs :
   - `offer_price_status`
   - `offer_price`
   - `offer_price_low`
   - `offer_price_high`
   - `offer_currency`
4. Vercel → redéployer sans l'ancien Build Cache.
5. Recharger `/ipo-insiders` avec `Ctrl + Shift + R`.

## Réglages facultatifs Render

```text
IPO_PRICE_ENRICHMENT_LIMIT=90
IPO_PRICE_CONCURRENCY=8
```

Ces valeurs limitent le nombre de prospectus analysés lors d'une actualisation et
le nombre de requêtes simultanées. Les prix sont mis en cache plus longtemps que
la liste principale pour limiter la charge sur les sources officielles.

## Garde-fous

- aucun prix n'est inventé;
- une fourchette n'est jamais affichée comme prix final;
- une hypothèse est marquée avec le symbole `≈`;
- les champs absents restent « Non publié »;
- le lien « Source officielle » pointe vers le document utilisé pour le prix
  lorsqu'il est disponible.
