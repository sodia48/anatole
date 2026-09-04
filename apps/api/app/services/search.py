from app.schemas.search import SymbolSearchItem, SymbolSearchResponse
from app.data.etf_catalog import ETF_CATALOG
from app.services.tsx_composite_universe import tsx_composite_universe_service
from app.services.tsx60 import TSX60


class SymbolSearchService:
    @staticmethod
    def _normalize(value: str) -> str:
        return "".join(character for character in value.upper().strip() if character.isalnum() or character in {".", "-"})

    async def search(self, query: str, limit: int = 8) -> SymbolSearchResponse:
        normalized = self._normalize(query)
        if not normalized:
            return SymbolSearchResponse(query=query, items=[], count=0)

        rows: list[SymbolSearchItem] = [SymbolSearchItem(symbol=item.symbol, ticker=item.symbol, name=item.name, sector=item.sector, universe="tsx60") for item in TSX60]
        rows.extend(SymbolSearchItem(symbol=item["ticker"], ticker=item["ticker"], name=item["name"], sector=item["category"], exchange="TSX", universe="etf", instrument_type="etf", provider=item["provider"], exposure=item["exposure"]) for item in ETF_CATALOG)

        def rank_rows(candidates: list[SymbolSearchItem]) -> list[tuple[int, SymbolSearchItem]]:
            output: list[tuple[int, SymbolSearchItem]] = []
            seen: set[tuple[str, str]] = set()
            for item in candidates:
                identity = (item.symbol, item.instrument_type)
                if identity in seen:
                    continue
                seen.add(identity)
                symbol = item.symbol.upper()
                name = item.name.upper()
                sector = item.sector.upper()
                extra = f"{item.provider or ''} {item.exposure or ''}".upper()
                if symbol == normalized: rank = 0
                elif symbol.startswith(normalized): rank = 1
                elif normalized in symbol: rank = 2
                elif name.startswith(normalized): rank = 3
                elif normalized in name: rank = 4
                elif normalized in sector: rank = 5
                elif normalized in extra: rank = 6
                else: continue
                output.append((rank, item))
            return output

        ranked = rank_rows(rows)
        if not ranked:
            try:
                composite = [SymbolSearchItem(symbol=item.ticker, ticker=item.ticker, name=item.name, sector=item.sector or "N/D", exchange=item.exchange or "TSX", universe="composite") for item in await tsx_composite_universe_service.get_constituents()]
                ranked = rank_rows(composite)
            except Exception:  # noqa: BLE001
                pass

        ranked.sort(key=lambda item: (item[0], item[1].symbol))
        items = [item for _, item in ranked[:limit]]
        return SymbolSearchResponse(query=query, items=items, count=len(items))


symbol_search_service = SymbolSearchService()
