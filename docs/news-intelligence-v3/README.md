# News Intelligence V3 — audit éditorial et visuel

## Causes racines

- V2 créait une `NewsBriefFigure` pour chaque nombre et y recopiait la phrase complète. Une phrase avec cinq montants produisait cinq cartes presque identiques.
- Le lecteur affichait ensuite la même phrase dans le résumé, les cartes et parfois les autres rubriques. Les avertissements de traduction et de couverture apparaissaient plusieurs fois.
- Le service de nouvelles du titre considérait `relatedTickers` de Yahoo comme une preuve de pertinence directe, arrêtait la recherche à dix articles et triait essentiellement par date. Une interrogation réelle de Yahoo CA/EN sur Canadian Natural Resources, le 24 octobre 2026, a retourné **29 résultats The Motley Fool sur 30**, souvent des listes de dividendes ou de CELI.

## Corrections

- Le brief conserve chaque valeur, sa nature, son libellé, sa période et sa phrase justificative. Les valeurs d'une série cohérente sont présentées dans un tableau. Les justificatifs restent repliés ; trois chiffres isolés sont visibles au maximum avant « Voir les détails ».
- Les rubriques réutilisant presque la même phrase sont éliminées. En cas de simple extrait, la couverture limitée reste explicite et aucune interprétation n'est inventée.
- La traduction accepte une virgule décimale française et les équivalences `billion`/`milliard`, tout en vérifiant les valeurs, unités et devises. Une traduction qui change USD en CAD est rejetée. La langue originale est signalée une seule fois si aucun fournisseur ne produit une traduction valide.
- Les nouvelles Yahoo sont classées `direct`, `sector` ou exclues. Le ticker associé par Yahoo n'est pas une preuve directe. Les listes CELI/dividendes et commentaires généralistes sont exclus par défaut. Les annonces similaires sur trois jours sont regroupées, avec protection des dates et chiffres distincts. Un plafond souple équilibre les éditeurs parmi les premiers résultats, sans rétrograder une annonce directe au profit d'une nouvelle sectorielle. Les articles de plus de 120 jours ne sont plus présentés comme récents.
- La page publique [News Releases de Canadian Natural](https://www.cnrl.com/investors/news-releases/) complète Yahoo pour CNQ. Seuls les titres, liens PDF et dates affichés par le site de l'entreprise sont repris ; le lecteur les qualifie de « titre seulement ». L'intégration est limitée à cette page vérifiée. Les flux commerciaux de GlobeNewswire et d'autres distributeurs nécessitent des conditions de diffusion spécifiques ; aucun accès non vérifié ou contournement n'a été ajouté. [GlobeNewswire décrit ses options de flux et partenariats](https://www.globenewswire.com/en/newswire-press-release-content).
- La sélection journalise les fournisseurs interrogés, nombres récupérés et retenus, motifs de rejet, éditeurs et dernière date de publication. Une source secondaire indisponible ne masque pas les résultats disponibles.

## Vérification sur des publications réelles

- La page officielle CNQ fournit notamment le dividende et les résultats du deuxième trimestre datés du **6 août 2026** ; la [page de l'entreprise](https://www.cnrl.com/investors/events-presentations/) confirme la date des résultats. Le test en direct du service V3 a retenu quatre publications récentes : deux communiqués de l'entreprise, une révision d'objectif de cours de MT Newswires et une nouvelle sectorielle de PR Newswire. Les listes généralistes de The Motley Fool ne figuraient plus dans le résultat.
- Une [publication réelle de Statistique Canada sur le PIB du deuxième trimestre 2026](https://www150.statcan.gc.ca/n1/daily-quotidien/260828/dq260828a-fra.htm) a été lue par le service. Elle est étiquetée comme publication officielle consultée. Les chiffres retenus proviennent de son texte ; aucune prévision n'est ajoutée.
- Les montants **4,94 / 5,26 / 6,65 milliards USD** et les taux **6,6 % / 6,1 %** de l'exemple antimoine sont uniquement des fixtures de test fournies pour ce sprint. Les captures les marquent « Fixture de test » ; aucune de ces données n'est codée dans l'application.

## Captures comparatives

| Cas | Avant (V2) | Après (V3) |
| --- | --- | --- |
| Antimoine, phrase à cinq valeurs | [Avant](before-antimony.png) | [Après](after-antimony.png) |
| CNQ, dix articles d'un même éditeur | [Avant](before-cnq.png) | [Après](after-cnq.png) |
| Publication macroéconomique | [Avant](before-macro.png) | [Après](after-macro.png) |
| Texte intégral inaccessible | [Avant](before-limited.png) | [Après](after-limited.png) |

Vérification mobile : [antimoine](after-antimony-mobile.png), [CNQ](after-cnq-mobile.png). Les captures sont prises avec Playwright sur les composants réels et des réponses API contrôlées. Les données CNQ et StatCan réelles ont aussi été vérifiées séparément côté service.

## Couverture et limites

- Les communiqués officiels complémentaires sont configurés pour CNQ seulement. Les autres titres continuent avec Yahoo et peuvent présenter peu ou pas de nouvelles directement pertinentes ; l'interface l'indique honnêtement.
- Les PDF officiels ne sont pas interprétés par le moteur de brief : seul leur titre est présenté avec le lien vers le document original.
- Les pages d'éditeurs et les abonnements ne sont pas contournés. Un extrait Yahoo reste un extrait, même lorsqu'un article est visible dans le navigateur de l'utilisateur.
- Le classificateur lexical privilégie la précision et peut écarter une nouvelle pertinente dont le titre ne nomme pas clairement l'entreprise ni un événement. Les motifs de rejet sont journalisés pour ajuster les règles sur des exemples vérifiés.

## Validations locales

- API : 870 tests réussis ; nouveaux scénarios antimoine, cinq valeurs, devise et échelle, pertinence CNQ, éditeurs, doublons et panne de source.
- Mobile : 273 tests réussis, dont la série chiffrée et sa justification à la demande.
- TypeScript et lint web/mobile : réussis. Build Next.js : réussi. Budget web : **2 208 474 / 2 209 777 octets**, sans augmentation du plafond.
- Playwright ciblé V2/V3 : 14 scénarios réussis sur Chromium desktop et Pixel ; captures inspectées.
