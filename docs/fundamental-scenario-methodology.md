# Fundamental Intelligence 360 — simulations et valorisation

Le simulateur applique trois jeux d'hypothèses **saisis par l'utilisateur** au dernier exercice annuel disponible. Ses résultats sont des sensibilités, ni des observations historiques, ni des prévisions, ni un cours de marché. Le même contrat et le même service alimentent les vues web et mobile.

## Calculs

- Revenus : revenus publiés × (1 + choc de revenus) × (1 + choc de prix de matière première × part des revenus exposée). Le dernier facteur n'est autorisé que pour les sociétés minières et sa part exposée doit être saisie explicitement.
- Résultat opérationnel : revenus simulés × (marge opérationnelle publiée + variation de marge − inflation additionnelle des coûts). Une marge bancaire ou d'assurance ne se substitue pas à une marge industrielle.
- Résultat net : résultat net publié + (variation du résultat opérationnel − variation du coût de financement) × (1 − taux d'impôt effectif publié). Sans taux d'impôt exploitable ou coût d'intérêt requis, le résultat reste indisponible.
- Flux opérationnel : flux publié + variation du résultat net simulé − utilisation supplémentaire de fonds de roulement exprimée en pourcentage des revenus simulés. Cette transmission simplifiée des bénéfices à la trésorerie est une **hypothèse**, affichée dans les limites du modèle.
- Flux disponible : flux opérationnel simulé − dépenses d'investissement publiées × (1 + variation de dépenses). Les marges sont calculées à partir des résultats et revenus du même scénario.

Chaque valeur porte sa formule et ses entrées manquantes. Le résultat conserve le lien, la date de publication, la période et la devise de l'état financier de référence lorsqu'ils existent.
Un indicateur explicite signale si l'instantané de référence est périmé; dans ce cas, la simulation illustrative reste consultable mais la DCF est refusée.

## DCF conditionnelle

La DCF exige une demande explicite comprenant le taux d'actualisation, la croissance terminale et la croissance des flux projetés. Elle refuse les banques, assurances et REIT, les exercices périmés, les devises incohérentes, les flux non positifs, l'absence du nombre d'actions ou de la dette nette, et l'absence de **deux exercices annuels consécutifs, sourcés et à flux disponibles positifs**. Elle refuse aussi un résultat de capitaux propres non positif.

Les cinq flux futurs sont construits à partir du flux du scénario et du taux de croissance saisi. Leur valeur actuelle et une valeur terminale calculée par croissance perpétuelle donnent la valeur d'entreprise. La dette nette publiée est retranchée pour obtenir la valeur des capitaux propres puis la valeur par action. Le taux d'actualisation doit dépasser la croissance terminale d'au moins deux points. Une grille de sensibilité varie le taux d'actualisation de ±1 point et la croissance terminale de ±0,5 point; les combinaisons non valides ne sont pas affichées.

La DCF générique ne modélise ni cycles longs, ni dilution future, ni structure de capital changeante. Aucune de ses valeurs ne constitue un objectif de cours ou une recommandation. Le service retourne un motif explicite quand la DCF n'est pas applicable et laisse disponibles les autres calculs possibles.
