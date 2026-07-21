# Official Financials Engine V1 — S&P/TSX Composite

## Ce que cette livraison fait

Le moteur s'applique à tout ticker TSX, sans code Python propre à une société.

Hiérarchie :

1. dépôt officiel normalisé de l'émetteur;
2. SEC EDGAR CompanyFacts XBRL pour les sociétés interinscrites;
3. Yahoo public uniquement comme repli pour les champs encore absents.

Les valeurs officielles remplacent les valeurs secondaires champ par champ.
Une valeur officielle absente ne détruit pas une valeur secondaire disponible.

## Univers

`tsx_composite_universe.py` récupère le registre opérationnel des sociétés
depuis le fichier de positions XIC publié par BlackRock. Les espèces et dérivés
sont exclus.

## Fichiers à remplacer

- `apps/api/app/schemas/fundamentals.py`
- `apps/api/app/services/fundamentals.py`
- `apps/api/app/api/routes/fundamentals.py`
- `apps/web/components/stock/FocusFundamentals.tsx`

## Fichiers à ajouter

- `apps/api/app/services/tsx_composite_universe.py`
- `apps/api/app/services/sec_edgar.py`
- `apps/api/app/services/official_financials.py`
- `apps/api/app/data/official_financials/registry.json`
- `apps/api/app/data/official_financials/README.md`
- `apps/api/tests/test_sec_edgar_financials.py`
- `apps/api/tests/test_official_financials_merge.py`

## Important

Ne remplace pas `apps/api/app/api/router.py`.
La route `fundamentals.router` est déjà enregistrée dans le routeur principal.

## Variable Render recommandée

Ajouter sur `anatole-api` :

`SEC_USER_AGENT=Anatole souleyman@example.com`

La SEC demande un User-Agent déclarant l'application et un moyen de contact.
Remplace l'adresse d'exemple par une adresse que tu contrôles.

## Endpoints

- `/api/v1/stocks/RY/fundamentals`
- `/api/v1/stocks/official-financials/coverage`

## Déploiement

1. Commit sur `main`.
2. Render → `anatole-api` → Clear build cache & deploy.
3. Vercel → redéployer sans l'ancien cache.
4. Recharge Anatole avec `Ctrl + Shift + R`.

## Limite honnête de V1

Les sociétés interinscrites avec XBRL SEC sont enrichies automatiquement.
Pour les sociétés TSX uniquement, le moteur est universel mais leurs dépôts
SEDAR+/IR doivent être normalisés dans `registry.json`. SEDAR+ offre la
recherche publique de documents, mais pas une API REST publique documentée
équivalente à CompanyFacts. Le registre évite tout traitement spécial en code
et permet d'étendre progressivement la couverture à l'ensemble du Composite.
