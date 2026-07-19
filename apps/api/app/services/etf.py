import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic

from app.schemas.discovery import EtfDirectoryItem, EtfDirectorySnapshot
from app.services.market_data import market_data_service


@dataclass(frozen=True)
class EtfMeta:
    symbol: str
    name: str
    provider: str
    category: str
    exposure: str


ETF_DIRECTORY = (
    EtfMeta("XIC", "iShares Core S&P/TSX Capped Composite Index ETF", "iShares", "Canada — marché large", "Actions canadiennes diversifiées"),
    EtfMeta("XIU", "iShares S&P/TSX 60 Index ETF", "iShares", "Canada — grandes capitalisations", "S&P/TSX 60"),
    EtfMeta("VCN", "Vanguard FTSE Canada All Cap Index ETF", "Vanguard", "Canada — marché large", "Actions canadiennes toutes capitalisations"),
    EtfMeta("ZCN", "BMO S&P/TSX Capped Composite Index ETF", "BMO", "Canada — marché large", "S&P/TSX Capped Composite"),
    EtfMeta("XDV", "iShares Canadian Select Dividend Index ETF", "iShares", "Dividendes", "Actions canadiennes à dividendes"),
    EtfMeta("VDY", "Vanguard FTSE Canadian High Dividend Yield Index ETF", "Vanguard", "Dividendes", "Rendement élevé canadien"),
    EtfMeta("ZDV", "BMO Canadian Dividend ETF", "BMO", "Dividendes", "Actions canadiennes à dividendes"),
    EtfMeta("XEG", "iShares S&P/TSX Capped Energy Index ETF", "iShares", "Secteur — énergie", "Producteurs et infrastructures énergétiques"),
    EtfMeta("XFN", "iShares S&P/TSX Capped Financials Index ETF", "iShares", "Secteur — financières", "Banques, assurances et services financiers"),
    EtfMeta("XMA", "iShares S&P/TSX Capped Materials Index ETF", "iShares", "Secteur — matériaux", "Métaux, mines et matériaux"),
    EtfMeta("XIT", "iShares S&P/TSX Capped Information Technology Index ETF", "iShares", "Secteur — technologie", "Technologie canadienne"),
    EtfMeta("XRE", "iShares S&P/TSX Capped REIT Index ETF", "iShares", "Secteur — immobilier", "Fiducies immobilières canadiennes"),
    EtfMeta("XUT", "iShares S&P/TSX Capped Utilities Index ETF", "iShares", "Secteur — services publics", "Services publics canadiens"),
    EtfMeta("XST", "iShares S&P/TSX Capped Consumer Staples Index ETF", "iShares", "Secteur — consommation de base", "Consommation de base canadienne"),
    EtfMeta("XBB", "iShares Core Canadian Universe Bond Index ETF", "iShares", "Obligations", "Obligations canadiennes de qualité"),
    EtfMeta("VAB", "Vanguard Canadian Aggregate Bond Index ETF", "Vanguard", "Obligations", "Marché obligataire canadien agrégé"),
    EtfMeta("ZAG", "BMO Aggregate Bond Index ETF", "BMO", "Obligations", "Obligations canadiennes agrégées"),
    EtfMeta("CASH", "Global X High Interest Savings ETF", "Global X", "Liquidités", "Dépôts à intérêt élevé"),
    EtfMeta("CBIL", "Global X 0-3 Month T-Bill ETF", "Global X", "Liquidités", "Bons du Trésor du Canada à court terme"),
    EtfMeta("XEQT", "iShares Core Equity ETF Portfolio", "iShares", "Portefeuille tout-en-un", "Portefeuille mondial 100 % actions"),
    EtfMeta("VEQT", "Vanguard All-Equity ETF Portfolio", "Vanguard", "Portefeuille tout-en-un", "Portefeuille mondial 100 % actions"),
    EtfMeta("XGRO", "iShares Core Growth ETF Portfolio", "iShares", "Portefeuille tout-en-un", "Portefeuille croissance mondial"),
    EtfMeta("VGRO", "Vanguard Growth ETF Portfolio", "Vanguard", "Portefeuille tout-en-un", "Portefeuille croissance mondial"),
    EtfMeta("XBAL", "iShares Core Balanced ETF Portfolio", "iShares", "Portefeuille tout-en-un", "Portefeuille équilibré mondial"),
    EtfMeta("VBAL", "Vanguard Balanced ETF Portfolio", "Vanguard", "Portefeuille tout-en-un", "Portefeuille équilibré mondial"),
    EtfMeta("XUS", "iShares Core S&P 500 Index ETF", "iShares", "États-Unis", "S&P 500 en dollars canadiens"),
    EtfMeta("VFV", "Vanguard S&P 500 Index ETF", "Vanguard", "États-Unis", "S&P 500 en dollars canadiens"),
    EtfMeta("ZSP", "BMO S&P 500 Index ETF", "BMO", "États-Unis", "S&P 500 en dollars canadiens"),
    EtfMeta("XQQ", "iShares NASDAQ 100 Index ETF (CAD-Hedged)", "iShares", "États-Unis — technologie", "NASDAQ-100 couvert en CAD"),
    EtfMeta("TEC", "TD Global Technology Leaders Index ETF", "TD", "Technologie mondiale", "Leaders technologiques mondiaux"),
)


class EtfService:
    cache_ttl_seconds = 45.0

    def __init__(self) -> None:
        self._cached: EtfDirectorySnapshot | None = None
        self._cached_at = 0.0
        self._lock = asyncio.Lock()

    async def get_directory(self) -> EtfDirectorySnapshot:
        now = monotonic()
        if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
            return self._cached
        async with self._lock:
            now = monotonic()
            if self._cached is not None and now - self._cached_at < self.cache_ttl_seconds:
                return self._cached
            quotes = await market_data_service.get_quotes([item.symbol for item in ETF_DIRECTORY])
            quote_by_symbol = {quote.symbol.replace("-", "."): quote for quote in quotes}
            items: list[EtfDirectoryItem] = []
            for meta in ETF_DIRECTORY:
                quote = quote_by_symbol.get(meta.symbol)
                if quote is None:
                    continue
                items.append(EtfDirectoryItem(ticker=quote.ticker, symbol=meta.symbol, name=meta.name, provider=meta.provider, category=meta.category, exposure=meta.exposure, currency=quote.currency, price=round(quote.price, 4), change_percent=round(quote.change_percent, 4), volume=quote.volume, source=quote.source, delayed=quote.delayed))
            snapshot = EtfDirectorySnapshot(items=items, categories=sorted({item.category for item in items}), generated_at=datetime.now(UTC), refresh_after_seconds=45)
            self._cached = snapshot
            self._cached_at = monotonic()
            return snapshot


etf_service = EtfService()
