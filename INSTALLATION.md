# ETF Sector Directory V1.1 — Correctif 0 ETF

## Cause corrigée

Le modèle FastAPI actuel `EtfDirectorySnapshot` exige le champ
`categories`. La première version construisait `items`, mais omettait ce
champ obligatoire. Pydantic rejetait donc la réponse et l'endpoint renvoyait
une erreur.

Le service attendait aussi les cotations publiques au premier chargement.
Cette attente pouvait dépasser le délai du proxy Vercel.

## Nouveau fonctionnement

- les 172 ETF sont retournés immédiatement;
- `categories` est toujours fourni;
- les cotations sont chargées en arrière-plan;
- une panne Yahoo ne peut plus vider le catalogue;
- les prix indisponibles apparaissent N/D dans la nouvelle page;
- 13 groupes sectoriels sont disponibles.

## Ajouter / remplacer

- `apps/api/app/data/__init__.py`
- `apps/api/app/data/etf_catalog.py`
- `apps/api/app/services/etf.py`
- `apps/api/tests/test_etf_catalog.py`
- `apps/api/tests/test_etf_service_snapshot.py`
- `apps/web/app/etf/page.tsx`
- `apps/web/app/etf/page.module.css`

## Ordre de déploiement

1. GitHub : ajoute/remplace tous les fichiers du ZIP.
2. Render : `anatole-api` → **Clear build cache & deploy**.
3. Ouvre :
   `https://anatole-api.onrender.com/api/v1/discovery/etfs`
4. La réponse doit contenir :
   - `items` avec 172 entrées;
   - `categories` avec 13 groupes.
5. Vercel : redéploie le frontend sans cache.
6. Recharge `/etf` avec `Ctrl + Shift + R`.

Le nouveau frontend affiche le titre « ETF canadiens par secteur ». Si
« ETF canadiens suivis » reste visible, Vercel sert encore l'ancien
déploiement.
