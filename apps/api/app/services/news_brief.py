from __future__ import annotations

import re
from datetime import UTC, datetime
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlsplit

from app.core.resilience import AsyncStaleCache, shared_http_client
from app.schemas.discovery import NewsBriefFigure, NewsBriefRequest, NewsBriefResponse

_ALLOWED = (
    "statcan.gc.ca", "canada.ca", "gc.ca", "bankofcanada.ca",
    "statistique.quebec.ca", "quebec.ca", "ontario.ca", "alberta.ca",
    "saskatchewan.ca", "gov.mb.ca", "gov.bc.ca", "gnb.ca",
    "novascotia.ca", "princeedwardisland.ca", "gov.nl.ca",
)
_IGNORED = {"script", "style", "noscript", "svg", "nav", "footer", "form", "aside"}
_CAPTURE = {"p", "li", "h2", "h3", "h4", "td"}
_SPACE = re.compile(r"\s+")
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9])")
_NUMBER = re.compile(
    r"(?<!\w)(?:[$€£]\s*)?[+-]?\d{1,3}(?:[ \u202f,]\d{3})*(?:[.,]\d+)?"
    r"\s*(?:%|points?|pts?|CAD|USD|GJ|PJ|TJ|MWh|GWh|TWh|m3|m³|"
    r"millions?|milliards?|billions?|million|billion|k|K|M|G)?(?!\w)",
    re.IGNORECASE,
)
_CHANGE = (
    "hausse", "baisse", "augment", "diminu", "progress", "recul", "variation",
    "par rapport", "compar", "increase", "decrease", "rose", "fell", "grew",
    "declined", "up ", "down ", "change", "compared",
)
_LOW = (
    "il est maintenant possible", "it is now possible", "consulter les données",
    "consult the data", "pour plus de renseignements", "for more information",
    "cliquez ici", "click here", "abonnez-vous", "subscribe",
)


class ArticleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self.ignored = 0
        self.capture = 0
        self.buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag in _IGNORED:
            self.ignored += 1
            return
        if self.ignored:
            return
        if tag in _CAPTURE:
            if not self.capture:
                self.buffer = []
            self.capture += 1

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _IGNORED:
            self.ignored = max(0, self.ignored - 1)
            return
        if self.ignored:
            return
        if tag in _CAPTURE and self.capture:
            self.capture -= 1
            if not self.capture:
                value = _clean(" ".join(self.buffer))
                if len(value) >= 25:
                    self.blocks.append(value)
                self.buffer = []

    def handle_data(self, data: str) -> None:
        if self.ignored or not self.capture:
            return
        value = _clean(data)
        if value:
            self.buffer.append(value)


def _clean(value: str) -> str:
    return _SPACE.sub(" ", unescape(value or "")).strip()


def _sentences(blocks: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for block in blocks:
        for raw in _SENTENCE.split(_clean(block)):
            item = raw.strip(" -–—•\t\r\n")
            if len(item) < 35 or len(item) > 420:
                continue
            key = item.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def _tokens(title: str) -> set[str]:
    stop = {"avec", "dans", "pour", "plus", "cette", "with", "from", "that", "this"}
    return {w for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", title.casefold()) if w not in stop}


def _score(sentence: str, title: str) -> float:
    low = sentence.casefold()
    score = 2.0 if 60 <= len(sentence) <= 260 else 0.0
    if _NUMBER.search(sentence): score += 4.0
    if any(word in low for word in _CHANGE): score += 2.5
    score += min(sum(1 for token in _tokens(title) if token in low), 4) * 0.8
    if any(phrase in low for phrase in _LOW): score -= 5.0
    return score


def _summary(sentences: list[str], title: str, fallback: str) -> str:
    if not sentences:
        return _clean(fallback)
    ranked = sorted(enumerate(sentences), key=lambda pair: (-_score(pair[1], title), pair[0]))
    indexes = sorted(index for index, _ in ranked[:3])
    chosen: list[str] = []
    size = 0
    for index in indexes:
        sentence = sentences[index]
        if chosen and size + len(sentence) > 760:
            continue
        chosen.append(sentence)
        size += len(sentence)
    return " ".join(chosen).strip() or _clean(fallback)


def _figures(sentences: list[str]) -> list[NewsBriefFigure]:
    out: list[NewsBriefFigure] = []
    seen: set[str] = set()
    for sentence in sentences:
        for match in _NUMBER.finditer(sentence):
            raw = _clean(match.group(0))
            compact = raw.replace(" ", "").replace("\u202f", "")
            if re.fullmatch(r"(?:19|20)\d{2}", compact):
                continue
            explicit = bool(re.search(
                r"[%$€£]|CAD|USD|GJ|PJ|TJ|MWh|GWh|TWh|m3|m³|million|milliard|billion|\bpts?\b|\bpoints?\b",
                raw, re.IGNORECASE,
            ))
            if not explicit:
                continue
            key = raw.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(NewsBriefFigure(value=raw, context=sentence[:260]))
            if len(out) >= 4:
                return out
    return out


def _changes(sentences: list[str]) -> list[str]:
    out: list[str] = []
    for sentence in sentences:
        low = sentence.casefold()
        if any(word in low for word in _CHANGE) and sentence not in out:
            out.append(sentence)
        if len(out) >= 3:
            break
    return out


def _theme(category: str, title: str) -> str:
    value = f"{category} {title}".casefold()
    for name, words in (
        ("inflation", ("inflation", "indice des prix", "consumer price", "ipc", "cpi")),
        ("emploi", ("emploi", "chômage", "employment", "unemployment", "labour")),
        ("pib", ("pib", "gdp", "produit intérieur", "economic growth", "croissance")),
        ("logement", ("logement", "housing", "mises en chantier", "building permits")),
        ("commerce", ("commerce", "retail", "wholesale", "ventes", "trade")),
        ("energie", ("énergie", "energy", "gaz naturel", "natural gas", "pétrole", "oil")),
        ("population", ("population", "démograph", "demograph")),
        ("taux", ("taux directeur", "interest rate", "policy rate", "monetary")),
    ):
        if any(word in value for word in words):
            return name
    return "macro"


def _why(theme: str, language: str) -> str:
    fr = {
        "inflation": "Cette publication aide à mesurer la pression sur le pouvoir d’achat et le contexte auquel la Banque du Canada réagit. Des mouvements persistants peuvent influencer les attentes de taux et la consommation.",
        "emploi": "Ces données permettent de suivre la vigueur du marché du travail, la demande de main-d’œuvre et les pressions salariales. Elles donnent aussi du contexte sur la consommation et la politique monétaire.",
        "pib": "Le PIB réel donne une lecture directe du rythme de l’activité économique. Sa trajectoire aide à distinguer accélération, stagnation et contraction.",
        "logement": "Le logement réagit rapidement aux taux, au crédit et à la démographie. Cette publication aide à suivre l’offre future, la construction et les tensions potentielles sur le marché résidentiel.",
        "commerce": "Ces données donnent un signal sur la demande des ménages et des entreprises. Elles aident à distinguer une variation ponctuelle d’un changement plus durable dans la consommation ou les échanges.",
        "energie": "Ces données aident à suivre l’équilibre entre production, transport, stockage et demande énergétique. Des mouvements persistants peuvent modifier le contexte des producteurs, des infrastructures et des flux interprovinciaux.",
        "population": "La population influence directement la taille du marché intérieur, la demande de logements, les besoins en services et l’offre de main-d’œuvre. Sa cadence de croissance est centrale pour lire les autres indicateurs par habitant.",
        "taux": "Cette publication éclaire le contexte de politique monétaire et le coût du crédit. Elle peut modifier les conditions financières auxquelles font face ménages et entreprises.",
        "macro": "Cette publication complète le pouls macroéconomique canadien. Il faut la comparer aux données précédentes et aux indicateurs connexes pour distinguer un mouvement isolé d’une tendance durable.",
    }
    en = {
        "inflation": "This release helps track purchasing-power pressure and the backdrop the Bank of Canada responds to. Persistent moves can influence rate expectations and household spending.",
        "emploi": "These data help track labour-market strength, labour demand and wage pressure. They also provide context for consumption and monetary policy.",
        "pib": "Real GDP is a direct reading of the pace of economic activity. Its path helps distinguish acceleration, stagnation and contraction.",
        "logement": "Housing responds quickly to rates, credit and demographics. This release helps track future supply, construction activity and potential residential-market pressure.",
        "commerce": "These data signal household and business demand and help distinguish a one-off move from a more durable shift in spending or trade.",
        "energie": "These data help track the balance between energy production, transportation, storage and demand. Persistent moves can change the backdrop for producers, infrastructure and interprovincial flows.",
        "population": "Population directly affects market size, housing demand, service needs and labour supply. Its growth rate is central to interpreting other indicators on a per-capita basis.",
        "taux": "This release informs the monetary-policy backdrop and the cost of credit. It can change the financial conditions faced by households and businesses.",
        "macro": "This release adds to the Canadian macroeconomic picture. Compare it with prior releases and related indicators to separate one-off noise from a durable trend.",
    }
    return (fr if language == "fr" else en)[theme]


def _watch(theme: str, language: str) -> list[str]:
    fr = {
        "inflation": ["La prochaine lecture mensuelle et les révisions de la donnée actuelle.", "La diffusion ou le recul des pressions de prix entre les composantes."],
        "emploi": ["La prochaine publication sur l’emploi et le chômage.", "L’écart entre croissance de la population active et création d’emplois."],
        "pib": ["La prochaine révision ou estimation mensuelle/trimestrielle du PIB.", "Le caractère généralisé ou concentré de la croissance entre les industries."],
        "logement": ["Les prochaines mises en chantier et permis de bâtir.", "La transmission des conditions de financement vers l’offre de logements."],
        "commerce": ["La prochaine lecture du commerce de détail ou de gros.", "La persistance du mouvement après prise en compte de l’inflation et de la population."],
        "energie": ["La prochaine mise à jour sur la production, le stockage et les livraisons.", "La persistance du mouvement entre provinces et dans les flux d’exportation."],
        "population": ["La prochaine estimation trimestrielle de population et ses révisions.", "La croissance par habitant comparée à la croissance économique totale."],
        "taux": ["La prochaine décision de la Banque du Canada et les données d’inflation/emploi.", "L’évolution des attentes de taux et des conditions de crédit."],
        "macro": ["La prochaine publication de la même série.", "La confirmation du mouvement par des indicateurs connexes avant d’en faire une tendance."],
    }
    en = {
        "inflation": ["The next monthly reading and revisions to the latest data.", "Whether price pressure broadens or narrows across components."],
        "emploi": ["The next employment/unemployment release.", "Whether labour-force growth keeps pace with job creation."],
        "pib": ["The next GDP revision or monthly/quarterly estimate.", "Whether growth remains broad-based or concentrated in a few industries."],
        "logement": ["The next housing-starts and building-permits readings.", "Whether financing conditions translate into stronger or weaker supply."],
        "commerce": ["The next retail/wholesale reading.", "Whether the move persists after inflation and population growth are considered."],
        "energie": ["The next production, storage and delivery update.", "Whether the latest move persists across provinces and export flows."],
        "population": ["The next quarterly population estimate and revisions.", "Per-capita growth compared with total economic growth."],
        "taux": ["The next Bank of Canada decision and inflation/labour data.", "Changes in market rate expectations and credit conditions."],
        "macro": ["The next release in the same series.", "Confirmation from related indicators before treating the move as a trend."],
    }
    return (fr if language == "fr" else en)[theme]


class NewsBriefService:
    def __init__(self) -> None:
        self._cache: AsyncStaleCache[str, NewsBriefResponse] = AsyncStaleCache(
            max_entries=1200,
            metric_namespace="news-brief",
        )

    @staticmethod
    def _allowed(url: str) -> bool:
        try:
            parsed = urlsplit(url)
        except ValueError:
            return False
        host = (parsed.hostname or "").lower().rstrip(".")
        if parsed.scheme != "https" or not host:
            return False
        return any(host == suffix or host.endswith(f".{suffix}") for suffix in _ALLOWED)

    async def _fetch_text(self, url: str) -> str:
        response = await shared_http_client.request(
            "GET",
            url,
            attempts=1,
            headers={"Accept": "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.7"},
        )
        content_type = response.headers.get("content-type", "").lower()
        if "html" not in content_type and "text/plain" not in content_type:
            raise RuntimeError("Unsupported article content type")
        raw = response.text[:2_000_000]
        if "html" not in content_type:
            return _clean(raw)
        parser = ArticleParser()
        parser.feed(raw)
        return "\n".join(parser.blocks[:240])

    def build_from_text(
        self,
        request: NewsBriefRequest,
        article_text: str,
        *,
        source_mode: str,
    ) -> NewsBriefResponse:
        blocks = [block for block in article_text.splitlines() if _clean(block)]
        fallback = request.summary or request.title
        sentences = _sentences(blocks)
        if len(sentences) < 2 and request.summary:
            sentences = _sentences([request.summary, *blocks])
        theme = _theme(request.category, request.title)
        if request.language == "fr":
            note = (
                "Faits extraits de la publication officielle. La section « Lecture Anatole » est une mise en contexte analytique, distincte de la source."
                if source_mode == "official_page" else
                "La page officielle n’a pas pu être extraite; les faits proviennent du résumé officiel déjà reçu par Anatole. La « Lecture Anatole » reste distincte."
            )
        else:
            note = (
                "Facts extracted from the official publication. The ‘Anatole read’ is analytical context and is separate from the source."
                if source_mode == "official_page" else
                "The official page could not be extracted; the facts come from the official summary already received by Anatole. The ‘Anatole read’ remains separate."
            )
        return NewsBriefResponse(
            title=request.title,
            summary=_summary(sentences, request.title, fallback),
            key_figures=_figures(sentences),
            changes=_changes(sentences),
            why_it_matters=_why(theme, request.language),
            watch=_watch(theme, request.language),
            source_url=request.url,
            source_name=request.source,
            source_mode=source_mode,
            source_note=note,
            generated_at=datetime.now(UTC),
        )

    async def _load(self, request: NewsBriefRequest) -> NewsBriefResponse:
        source_mode = "feed_summary"
        article_text = request.summary
        if self._allowed(request.url):
            try:
                fetched = await self._fetch_text(request.url)
            except Exception:
                fetched = ""
            if len(fetched) >= 120:
                source_mode = "official_page"
                article_text = fetched
        return self.build_from_text(request, article_text, source_mode=source_mode)

    async def get_brief(self, request: NewsBriefRequest) -> NewsBriefResponse:
        key = f"{request.language}|{request.url}|{request.title}"
        return await self._cache.get_or_load(
            key,
            lambda: self._load(request),
            fresh_seconds=6 * 60 * 60,
            stale_seconds=48 * 60 * 60,
        )


news_brief_service = NewsBriefService()
