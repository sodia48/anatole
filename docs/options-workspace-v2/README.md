# Options Pro Workspace V2 — validation visuelle

Captures Playwright du cas **526 contrats synthétiques** (RY, données de test explicitement étiquetées). Elles servent uniquement à comparer la composition de l'interface ; elles ne représentent aucune cotation de marché.

## Avant

- [Chaîne à 526 contrats](before/before-chain-526-synthetic.png)
- [Après clic sur « Intelligence de volatilité »](before/before-volatility-526-synthetic.png) : le module commence à `y=43 350 px`, sous la chaîne ; il n'apparaît pas dans la fenêtre 1440 × 900.

## Après

| Espace | Desktop 1440 | Desktop 1920 | iPhone 14 | Pixel 7 |
| --- | --- | --- | --- | --- |
| Chaîne | [Capture](after/desktop-1440-workspace-chain.png) | [Capture](after/workspace-chain-desktop-1920.png) | [Capture](after/iphone-14-workspace-chain.png) | [Capture](after/pixel-7-workspace-chain.png) |
| Stratégies | [Capture](after/desktop-1440-workspace-strategies.png) | [Capture](after/workspace-strategies-desktop-1920.png) | [Capture](after/iphone-14-workspace-strategies.png) | [Capture](after/pixel-7-workspace-strategies.png) |
| Volatilité | [Capture](after/desktop-1440-workspace-volatility.png) | [Capture](after/workspace-volatility-desktop-1920.png) | [Capture](after/iphone-14-workspace-volatility.png) | [Capture](after/pixel-7-workspace-volatility.png) |
| Portefeuille | [Capture](after/desktop-1440-workspace-portfolio.png) | [Capture](after/workspace-portfolio-desktop-1920.png) | [Capture](after/iphone-14-workspace-portfolio.png) | [Capture](after/pixel-7-workspace-portfolio.png) |
| Screener | [Capture](after/desktop-1440-workspace-screener.png) | [Capture](after/workspace-screener-desktop-1920.png) | [Capture](after/iphone-14-workspace-screener.png) | [Capture](after/pixel-7-workspace-screener.png) |

Les vues après ont été inspectées à chaque taille. La navigation ne laisse plus la chaîne affichée au-dessus de Volatilité, Stratégies ou Portefeuille ; le Screener remplace la chaîne dans son sous-espace. La chaîne et le Screener paginent leurs résultats et bornent la hauteur de défilement.

## Vérification

- API : 962 tests réussis.
- Web unitaires : 25 tests réussis ; typecheck et lint réussis.
- Mobile : 299 tests réussis ; typecheck et lint réussis.
- E2E Options ciblés : 30 tests réussis sur desktop, Pixel 7 et iPhone 14, dont le cas 526 contrats et les volumes 100/500/1 000.
- Build web et budget JavaScript : 2 204 162 octets, sous le plafond existant de 2 209 777 octets.
