# Yahoo Structured Financial Statements V1

Cette mise à jour restaure dans FastAPI le pipeline de la bêta Streamlit :
`income_stmt`, `balance_sheet`, `cashflow` et leurs versions trimestrielles.

## Priorité

1. Dépôt officiel
2. États financiers Yahoo/yfinance structurés
3. Ancien quoteSummary
4. Calcul exact
5. N/D

## Remplacer

- apps/api/pyproject.toml
- apps/api/app/schemas/fundamentals.py
- apps/api/app/services/fundamentals.py
- apps/api/app/services/official_financials.py
- apps/api/app/api/routes/fundamentals.py
- apps/web/components/stock/FocusFundamentals.tsx

## Ajouter

- apps/api/app/services/yahoo_statements.py
- apps/api/tests/test_yahoo_statements.py
- apps/api/tests/test_yahoo_statements_priority.py

Ne touche pas à `apps/api/app/api/router.py` ni à `FocusClient.tsx`.

## Déploiement

1. Commit sur main.
2. Render → anatole-api → Clear build cache & deploy.
3. Tester `/api/v1/stocks/RY/structured-statements?refresh=true`.
4. Tester `/api/v1/stocks/RY/fundamentals`.
5. Vercel → redeploy sans cache.
6. Ctrl + Shift + R.

Résultat attendu : `annual_periods > 0` et `populated_fields > 0`.
Les lignes portent `YAHOO · STRUCTURÉ`; les valeurs dérivées portent
`CALCULÉ · n`.
