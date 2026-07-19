from app.schemas.search import SymbolSearchItem, SymbolSearchResponse
from app.services.tsx60 import TSX60


class SymbolSearchService:
    @staticmethod
    def _normalize(value: str) -> str:
        return "".join(character for character in value.upper().strip() if character.isalnum() or character in {".", "-"})

    def search(self, query: str, limit: int = 8) -> SymbolSearchResponse:
        normalized = self._normalize(query)
        if not normalized:
            return SymbolSearchResponse(query=query, items=[], count=0)

        ranked: list[tuple[int, SymbolSearchItem]] = []
        for constituent in TSX60:
            symbol = constituent.symbol.upper()
            name = constituent.name.upper()
            sector = constituent.sector.upper()

            if symbol == normalized:
                rank = 0
            elif symbol.startswith(normalized):
                rank = 1
            elif normalized in symbol:
                rank = 2
            elif name.startswith(normalized):
                rank = 3
            elif normalized in name:
                rank = 4
            elif normalized in sector:
                rank = 5
            else:
                continue

            ranked.append(
                (
                    rank,
                    SymbolSearchItem(
                        symbol=constituent.symbol,
                        ticker=constituent.symbol,
                        name=constituent.name,
                        sector=constituent.sector,
                    ),
                )
            )

        ranked.sort(key=lambda item: (item[0], item[1].symbol))
        items = [item for _, item in ranked[:limit]]
        return SymbolSearchResponse(query=query, items=items, count=len(items))


symbol_search_service = SymbolSearchService()
