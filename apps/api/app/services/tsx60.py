from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Constituent:
    symbol: str
    name: str
    sector: str
    weight: float


# Constituents and approximate portfolio weights sourced from XIU holdings,
# snapshot dated 2026-07-16. The list is isolated here so it can later be
# replaced by a licensed or automatically synchronized universe provider.
TSX60_AS_OF = "2026-07-16"
TSX60_SOURCE = "iShares XIU holdings"
TSX60: tuple[Constituent, ...] = (
    Constituent(symbol='RY', name='Royal Bank Of Canada', sector='Financials', weight=10.37),
    Constituent(symbol='TD', name='Toronto Dominion', sector='Financials', weight=7.12),
    Constituent(symbol='SHOP', name='Shopify Subordinate Voting Inc. Cla', sector='Information Technology', weight=5.25),
    Constituent(symbol='BMO', name='Bank Of Montreal', sector='Financials', weight=4.40),
    Constituent(symbol='ENB', name='Enbridge Inc.', sector='Energy', weight=4.24),
    Constituent(symbol='CM', name='Canadian Imperial Bank Of Commerce', sector='Financials', weight=3.82),
    Constituent(symbol='BNS', name='Bank Of Nova Scotia', sector='Financials', weight=3.79),
    Constituent(symbol='BN', name='Brookfield Corp Class A', sector='Financials', weight=3.26),
    Constituent(symbol='CNQ', name='Canadian Natural Resources Ltd.', sector='Energy', weight=3.07),
    Constituent(symbol='CP', name='Canadian Pacific Kansas City Ltd.', sector='Industrials', weight=2.84),
    Constituent(symbol='TRP', name='Tc Energy Corp', sector='Energy', weight=2.51),
    Constituent(symbol='MFC', name='Manulife Financial Corp', sector='Financials', weight=2.49),
    Constituent(symbol='SU', name='Suncor Energy Inc.', sector='Energy', weight=2.47),
    Constituent(symbol='AEM', name='Agnico Eagle Mines Ltd.', sector='Materials', weight=2.40),
    Constituent(symbol='CNR', name='Canadian National Railway', sector='Industrials', weight=2.39),
    Constituent(symbol='NA', name='National Bank Of Canada', sector='Financials', weight=2.21),
    Constituent(symbol='ABX', name='Barrick Mining Corp', sector='Materials', weight=2.01),
    Constituent(symbol='ATD', name='Alimentation Couche Tard Inc.', sector='Consumer Staples', weight=1.65),
    Constituent(symbol='WPM', name='Wheaton Precious Metals Corp', sector='Materials', weight=1.63),
    Constituent(symbol='SLF', name='Sun Life Financial Inc.', sector='Financials', weight=1.56),
    Constituent(symbol='WCN', name='Waste Connections Inc.', sector='Industrials', weight=1.53),
    Constituent(symbol='CSU', name='Constellation Software Inc.', sector='Information Technology', weight=1.38),
    Constituent(symbol='FNV', name='Franco Nevada Corp', sector='Materials', weight=1.32),
    Constituent(symbol='CCO', name='Cameco Corp', sector='Energy', weight=1.31),
    Constituent(symbol='IFC', name='Intact Financial Corp', sector='Financials', weight=1.27),
    Constituent(symbol='CVE', name='Cenovus Energy', sector='Energy', weight=1.26),
    Constituent(symbol='DOL', name='Dollarama Inc.', sector='Consumer Discretionary', weight=1.25),
    Constituent(symbol='CLS', name='Celestica Inc.', sector='Information Technology', weight=1.20),
    Constituent(symbol='POW', name='Power Corporation Of Canada', sector='Financials', weight=1.19),
    Constituent(symbol='FFH', name='Fairfax Financial Holdings Sub Vot', sector='Financials', weight=1.13),
    Constituent(symbol='NTR', name='Nutrien Ltd.', sector='Materials', weight=1.11),
    Constituent(symbol='FTS', name='Fortis Inc.', sector='Utilities', weight=1.03),
    Constituent(symbol='PPL', name='Pembina Pipeline Corp', sector='Energy', weight=1.02),
    Constituent(symbol='K', name='Kinross Gold Corp', sector='Materials', weight=0.94),
    Constituent(symbol='QSR', name='Restaurants Brands International I', sector='Consumer Discretionary', weight=0.92),
    Constituent(symbol='L', name='Loblaw Companies Ltd.', sector='Consumer Staples', weight=0.89),
    Constituent(symbol='TECK.B', name='Teck Resources Subordinate Voting', sector='Materials', weight=0.86),
    Constituent(symbol='BCE', name='Bce Inc.', sector='Communication', weight=0.71),
    Constituent(symbol='BAM', name='Brookfield Asset Management Voting', sector='Financials', weight=0.64),
    Constituent(symbol='FM', name='First Quantum Minerals Ltd.', sector='Materials', weight=0.62),
    Constituent(symbol='IMO', name='Imperial Oil Ltd.', sector='Energy', weight=0.62),
    Constituent(symbol='BIP.UN', name='Brookfield Infrastructure Partners', sector='Utilities', weight=0.62),
    Constituent(symbol='WSP', name='Wsp Global Inc.', sector='Industrials', weight=0.60),
    Constituent(symbol='MG', name='Magna International Inc.', sector='Consumer Discretionary', weight=0.59),
    Constituent(symbol='EMA', name='Emera Inc.', sector='Utilities', weight=0.57),
    Constituent(symbol='T', name='Telus', sector='Communication', weight=0.57),
    Constituent(symbol='TOU', name='Tourmaline Oil Corp', sector='Energy', weight=0.56),
    Constituent(symbol='RCI.B', name='Rogers Communications Non-Voting I', sector='Communication', weight=0.46),
    Constituent(symbol='H', name='Hydro One Ltd.', sector='Utilities', weight=0.46),
    Constituent(symbol='TRI', name='Thomson Reuters Corp', sector='Industrials', weight=0.44),
    Constituent(symbol='MRU', name='Metro Inc.', sector='Consumer Staples', weight=0.44),
    Constituent(symbol='GIB.A', name='Cgi Inc. Class A', sector='Information Technology', weight=0.44),
    Constituent(symbol='WN', name='George Weston Ltd.', sector='Consumer Staples', weight=0.39),
    Constituent(symbol='GIL', name='Gildan Activewear Inc.', sector='Consumer Discretionary', weight=0.34),
    Constituent(symbol='CCL.B', name='Ccl Industries Inc. Class B', sector='Materials', weight=0.32),
    Constituent(symbol='CAE', name='Cae Inc.', sector='Industrials', weight=0.27),
    Constituent(symbol='SAP', name='Saputo Inc.', sector='Consumer Staples', weight=0.25),
    Constituent(symbol='CTC.A', name='Canadian Tire Ltd. Class A', sector='Consumer Discretionary', weight=0.24),
    Constituent(symbol='FSV', name='Firstservice Subordinate Voting Co', sector='Real Estate', weight=0.21),
    Constituent(symbol='OTEX', name='Open Text Corp', sector='Information Technology', weight=0.19),
)
