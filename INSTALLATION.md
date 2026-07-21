# Issuer Financial Documents Engine V1 — TSX Composite

Cette livraison remplace le registre vide par un moteur qui travaille
réellement avec les sites officiels des sociétés.

## Hiérarchie des sources

1. SEC EDGAR XBRL lorsque disponible;
2. PDF, XLSX ou page financière publiée sur le site officiel de l’émetteur;
3. registre officiel normalisé local;
4. Yahoo uniquement pour les champs encore absents.

Le moteur :

- utilise le site officiel fourni dans le profil de l’entreprise;
- inspecte les chemins investisseurs habituels;
- lit `robots.txt`;
- exploite les XML sitemaps;
- ne suit que les pages du domaine officiel;
- accepte les documents CDN seulement lorsqu’ils sont liés depuis une page
  officielle;
- préfère les états financiers aux présentations et transcriptions;
- analyse les PDF avec pypdf;
- analyse les classeurs XLSX avec openpyxl;
- détecte CAD/USD, milliers/millions, périodes et principaux postes;
- refuse une extraction trop pauvre au lieu d’inventer des chiffres;
- conserve la source et le lien officiel sur chaque période.

## Fichiers à remplacer

- `apps/api/pyproject.toml`
- `apps/api/app/schemas/fundamentals.py`
- `apps/api/app/services/fundamentals.py`
- `apps/api/app/services/official_financials.py`
- `apps/api/app/api/routes/fundamentals.py`
- `apps/web/components/stock/FocusFundamentals.tsx`

## Fichiers à ajouter

- `apps/api/app/services/issuer_documents.py`
- `apps/api/app/services/issuer_document_parser.py`
- `apps/api/app/data/official_financials/issuer_sites.json`
- `apps/api/app/data/official_financials/ISSUER_SITES.md`
- `apps/api/tests/test_issuer_document_parser.py`
- `apps/api/tests/test_issuer_document_xlsx.py`
- `apps/api/tests/test_issuer_document_discovery.py`

## Ne pas remplacer

Ne touche pas à :

- `apps/api/app/api/router.py`
- `apps/web/components/stock/FocusClient.tsx`

## Déploiement

1. Commit sur `main`.
2. Render → `anatole-api`.
3. `Clear build cache & deploy`.
4. Vercel → redéploiement sans ancien cache.
5. Recharge Anatole avec `Ctrl + Shift + R`.

Le nouveau `pyproject.toml` installe :

- `pypdf>=5.7,<7.0`
- `openpyxl>=3.1,<4.0`

## Vérification

Teste d’abord le diagnostic :

```text
/api/v1/stocks/VNP/official-documents?refresh=true
```

Puis :

```text
/api/v1/stocks/VNP/fundamentals
```

Dans le diagnostic, vérifie :

- `documents` non vide;
- `parsed_periods` supérieur à zéro;
- `parsed_fields` supérieur à zéro;
- les URL appartiennent au site officiel ou à un actif lié depuis celui-ci.

## Limite volontaire

Le moteur ne fait pas d’OCR. Un PDF uniquement composé d’images restera
non analysable. Cette décision évite les valeurs incertaines. Les PDF avec
une couche texte et les XLSX sont pris en charge.
