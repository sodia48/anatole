# Anatole v0.5 — IPO & Initiés

## Routes frontend

- `/ipo-insiders`
- `/ipo`
- `/insiders`

La page principale contient deux onglets : IPO et Initiés.

## Sources

### IPO

- TMX : nouvelles inscriptions TSX et TSXV.
- SEC EDGAR : dépôts S-1 et F-1 récents.

Les ETF, CDR et fonds sont classifiés séparément. Le filtre par
défaut conserve uniquement les sociétés.

### Initiés

- Canada : normalisation automatisée d’une source publique secondaire,
  avec lien de vérification vers le registre officiel SEDI.
- États-Unis : formulaires 4 et 4/A de la SEC, lus dans leur XML officiel.

SEDI ne propose pas d’API publique documentée adaptée à une collecte
automatisée simple. Anatole ne présente donc jamais la source canadienne
secondaire comme une déclaration officielle.

## Fichiers à ajouter

Backend :

- `apps/api/app/schemas/ipo_insiders.py`
- `apps/api/app/services/ipo.py`
- `apps/api/app/services/insiders.py`
- `apps/api/app/api/routes/ipo_insiders.py`
- `apps/api/tests/test_ipo_service.py`
- `apps/api/tests/test_insiders_service.py`

Frontend :

- `apps/web/lib/ipo-insiders-api.ts`
- `apps/web/components/ipo-insiders/IpoInsidersClient.tsx`
- `apps/web/components/ipo-insiders/IpoInsiders.module.css`
- `apps/web/app/ipo-insiders/page.tsx`
- `apps/web/app/ipo/page.tsx`
- `apps/web/app/insiders/page.tsx`

## Fichier à remplacer

- `apps/api/app/api/router.py`

## Activation du bouton du menu

Le bouton `IPO & insiders` doit pointer vers :

```text
/ipo-insiders
```

Retirer son indicateur `BIENTÔT` ou sa propriété équivalente :
`disabled`, `comingSoon`, `soon`, etc.

Les routes `/ipo` et `/insiders` restent disponibles pour les anciens liens.

## Déploiement

1. Ajouter/remplacer les fichiers dans GitHub.
2. Render → `anatole-api` → **Clear build cache & deploy**.
3. Tester :
   - `/api/v1/discovery/ipo`
   - `/api/v1/discovery/insiders?market=canada`
   - `/api/v1/discovery/insiders?market=us`
   - `/api/v1/discovery/insiders?market=us&ticker=AAPL`
4. Vercel → redéployer sans ancien cache.
5. Recharger `/ipo-insiders` avec `Ctrl + Shift + R`.

## Variable SEC facultative

Aucune nouvelle variable n’est obligatoire. Pour mieux identifier
Anatole auprès de la SEC :

```text
SEC_USER_AGENT=Anatole/0.5 votre-email@example.com
```

## Garde-fous

- aucune transaction inventée;
- aucune fausse date ou valeur;
- `N/D` lorsque le champ n’est pas publié;
- attributions et exercices exclus du flux net achats–ventes;
- doublons supprimés;
- dernière réponse valide conservée lorsqu’une source tombe en panne.
