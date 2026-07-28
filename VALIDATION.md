# Validation effectuée

- compilation Python de `router.py`;
- vérification statique des sept routeurs montés;
- compilation TypeScript stricte des deux clients de données;
- compilation TypeScript de la façade `api.ts` avec un stub de `resilientFetch`;
- compilation TypeScript de la route Next.js neutralisée avec un stub `next/server`;
- contrôle que les clients n’utilisent plus `/api/anatole`;
- contrôle des chemins Screener, ETF holdings/history, IPO et insiders;
- contrôle de l’intégrité du ZIP.

La validation réseau complète des routes de découverte doit être faite après le
redéploiement Render. L’endpoint `/health` répondait correctement au moment du
diagnostic, mais cela ne prouve pas que les routes `/api/v1/discovery/*` sont
montées.
