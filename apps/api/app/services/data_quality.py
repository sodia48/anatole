from __future__ import annotations

from datetime import UTC, datetime
from time import monotonic

from app.core.resilience import shared_http_client
from app.core.telemetry import reliability_monitor
from app.schemas.workspace import (
    DataQualityEndpoint,
    DataQualityMetric,
    DataQualitySnapshot,
    DataQualitySource,
)
from app.services.calendar import calendar_service
from app.services.cockpit import cockpit_service
from app.services.etf import etf_service
from app.services.etf_holdings import etf_holdings_service
from app.services.fundamentals import fundamentals_service
from app.services.insiders import insider_service
from app.services.ipo import ipo_service
from app.services.market_data import market_data_service
from app.services.news import news_service
from app.services.psychology import psychology_service
from app.services.screener import screener_service


_STARTED_AT = monotonic()


def _age(timestamp: float) -> float | None:
    if not timestamp:
        return None
    return max(0.0, monotonic() - timestamp)


def _cached_source(
    *,
    key: str,
    label: str,
    category: str,
    cached,
    cached_at: float,
    ttl: float,
    count: int,
    source: str,
    detail: str,
    coverage: float,
) -> DataQualitySource:
    age = _age(cached_at)
    if cached is None:
        status = "idle"
        detail = f"{detail} Pas encore réchauffé depuis le dernier démarrage."
    elif age is not None and age > ttl * 2:
        status = "stale"
    elif count <= 0:
        status = "degraded"
    else:
        status = "healthy"
    return DataQualitySource(
        key=key,
        label=label,
        category=category,
        status=status,
        coverage_percent=max(0.0, min(100.0, coverage)),
        freshness_seconds=round(age, 1) if age is not None else None,
        item_count=count,
        source=source,
        detail=detail,
    )


class DataQualityService:
    def snapshot(self) -> DataQualitySnapshot:
        metrics = shared_http_client.metrics
        request_count = max(metrics.requests, 1)
        retry_rate = metrics.retries / request_count * 100
        failure_rate = metrics.failures / request_count * 100
        reliability = reliability_monitor.snapshot()
        api_error_rate = float(reliability["error_rate_5xx"])

        cockpit = cockpit_service._cached
        screener = screener_service._cached
        news = news_service._cached
        calendar = calendar_service._cached
        psychology = psychology_service._cached
        ipo = ipo_service._cached

        sources: list[DataQualitySource] = [
            _cached_source(
                key="quotes",
                label="Cotations TSX 60",
                category="Marché",
                cached=cockpit,
                cached_at=cockpit_service._cached_at,
                ttl=cockpit_service.cache_ttl_seconds,
                count=len(cockpit.constituents) if cockpit else 0,
                source="Yahoo public + secours Anatole",
                detail="Prix, variation de séance, volume et largeur du marché.",
                coverage=(len(cockpit.constituents) / 60 * 100 if cockpit else 0),
            ),
            _cached_source(
                key="screener",
                label="Screener TSX 60",
                category="Analyse",
                cached=screener,
                cached_at=screener_service._cached_at,
                ttl=screener_service.cache_ttl_seconds,
                count=len(screener.items) if screener else 0,
                source="Yahoo public + moteur Anatole",
                detail="Historique, RSI, momentum, volume relatif et score.",
                coverage=(len(screener.items) / 60 * 100 if screener else 0),
            ),
            _cached_source(
                key="etf-directory",
                label="Répertoire ETF",
                category="ETF",
                cached=getattr(etf_service, "_quote_cache", None),
                cached_at=getattr(etf_service, "_last_full_refresh", 0.0),
                ttl=300,
                count=len(getattr(etf_service, "_quote_cache", {})),
                source="Catalogue Anatole + Yahoo public",
                detail="Catalogue complet toujours disponible; cotations enrichies en arrière-plan.",
                coverage=min(100.0, len(getattr(etf_service, "_quote_cache", {})) / 172 * 100),
            ),
            DataQualitySource(
                key="etf-holdings",
                label="Participations ETF",
                category="ETF",
                status="healthy" if etf_holdings_service._snapshot_cache else "idle",
                coverage_percent=min(100.0, len(etf_holdings_service._snapshot_cache) / 10 * 100),
                freshness_seconds=None,
                item_count=len(etf_holdings_service._snapshot_cache),
                source="Fournisseurs ETF + yfinance",
                detail="Compositions chargées à la demande puis mises en cache.",
            ),
            _cached_source(
                key="news",
                label="Actualités officielles",
                category="Découverte",
                cached=news,
                cached_at=news_service._cached_at,
                ttl=news_service.cache_ttl_seconds,
                count=len(news.items) if news else 0,
                source="Banque du Canada + Statistique Canada",
                detail="Flux RSS/Atom officiels avec déduplication et sentiment lexical.",
                coverage=(100 if news and news.items else 0),
            ),
            _cached_source(
                key="calendar",
                label="Calendrier économique",
                category="Découverte",
                cached=calendar,
                cached_at=calendar_service._cached_at,
                ttl=calendar_service.cache_ttl_seconds,
                count=len(calendar.events) if calendar else 0,
                source="Banque du Canada + Statistique Canada",
                detail="Événements officiels canadiens, importance et catégories.",
                coverage=(100 if calendar and calendar.events else 0),
            ),
            _cached_source(
                key="psychology",
                label="Psychologie du marché",
                category="Analyse",
                cached=psychology,
                cached_at=psychology_service._cached_at,
                ttl=psychology_service.cache_ttl_seconds,
                count=len(psychology.components) if psychology else 0,
                source="TSX Composite + largeur TSX 60",
                detail="Momentum, volatilité, tendance et leadership sectoriel.",
                coverage=(100 if psychology else 0),
            ),
            _cached_source(
                key="ipo",
                label="IPO et nouvelles inscriptions",
                category="Découverte",
                cached=ipo,
                cached_at=ipo_service._cached_at,
                ttl=3600,
                count=len(ipo.items) if ipo else 0,
                source="TMX + SEC EDGAR",
                detail="Sources officielles canadiennes et américaines.",
                coverage=(100 if ipo and ipo.items else 0),
            ),
            DataQualitySource(
                key="insiders",
                label="Transactions d’initiés",
                category="Découverte",
                status="healthy" if insider_service._snapshot_cache else "idle",
                coverage_percent=min(100.0, len(insider_service._snapshot_cache) * 20),
                freshness_seconds=None,
                item_count=len(insider_service._snapshot_cache),
                source="SEDI/Yahoo + SEC Form 4",
                detail="Scans à la demande avec cache par marché, période et univers.",
            ),
            DataQualitySource(
                key="fundamentals",
                label="Fondamentaux",
                category="Sociétés",
                status="healthy" if fundamentals_service._cache else "idle",
                coverage_percent=min(100.0, len(fundamentals_service._cache) / 10 * 100),
                freshness_seconds=None,
                item_count=len(fundamentals_service._cache),
                source="Documents officiels + Yahoo statements",
                detail="Résultats, états financiers et consensus chargés à la demande.",
            ),
        ]

        healthy = sum(item.status == "healthy" for item in sources)
        degraded = sum(item.status in {"degraded", "stale", "unavailable"} for item in sources)
        active_sources = sum(item.status != "idle" for item in sources)
        average_coverage = (
            sum(item.coverage_percent for item in sources) / len(sources)
            if sources
            else 0.0
        )

        provider_penalty = 20 if market_data_service.demo_mode else 0
        failure_penalty = min(25.0, failure_rate * 2.5)
        retry_penalty = min(12.0, retry_rate * 0.35)
        degraded_penalty = degraded * 4.0
        idle_penalty = max(0, len(sources) - active_sources) * 1.0
        api_penalty = min(20.0, api_error_rate * 4.0)
        score = max(
            0.0,
            min(
                100.0,
                100
                - provider_penalty
                - failure_penalty
                - retry_penalty
                - degraded_penalty
                - idle_penalty
                - api_penalty,
            ),
        )
        status = (
            "Excellent"
            if score >= 90
            else "Bon"
            if score >= 75
            else "Dégradé"
            if score >= 50
            else "Critique"
        )

        recommendations: list[str] = []
        if market_data_service.demo_mode:
            recommendations.append(
                "Le fournisseur est en mode démonstration; active MARKET_DATA_PROVIDER=yahoo en production."
            )
        if failure_rate >= 3:
            recommendations.append(
                "Le taux d’échec upstream est élevé; consulte les logs Render avec le X-Request-ID."
            )
        if retry_rate >= 10:
            recommendations.append(
                "Les sources publiques demandent de nombreux retries; évite les rafraîchissements manuels répétés."
            )
        if api_error_rate >= 1:
            recommendations.append(
                "Le taux HTTP 5xx du processus dépasse 1 %; utilise le X-Request-ID pour isoler les routes concernées."
            )
        if float(reliability["p95_duration_ms"]) >= 2500:
            recommendations.append(
                "Le temps de réponse p95 dépasse 2,5 s; vérifie les routes lentes avant le prochain déploiement."
            )
        if degraded:
            recommendations.append(
                "Ouvre les cartes dégradées ci-dessous pour identifier la source ou le cache concerné."
            )
        if not recommendations:
            recommendations.append(
                "Aucune action urgente. Les sources inactives se réchauffent à la première ouverture de leur section."
            )

        metric_items = [
            DataQualityMetric(
                key="provider",
                label="Mode fournisseur",
                value="Démonstration" if market_data_service.demo_mode else "Données publiques",
                status="degraded" if market_data_service.demo_mode else "healthy",
                detail="Source active pour les cotations et historiques de marché.",
            ),
            DataQualityMetric(
                key="coverage",
                label="Couverture moyenne",
                value=f"{average_coverage:.0f} %",
                status="healthy" if average_coverage >= 70 else "degraded",
                detail=f"{healthy} sources saines sur {len(sources)} suivies.",
            ),
            DataQualityMetric(
                key="upstream",
                label="Échecs upstream",
                value=f"{failure_rate:.1f} %",
                status="healthy" if failure_rate < 2 else "degraded" if failure_rate < 8 else "critical",
                detail=f"{metrics.failures} échecs sur {metrics.requests} requêtes externes.",
            ),
            DataQualityMetric(
                key="retries",
                label="Retries externes",
                value=f"{retry_rate:.1f} %",
                status="healthy" if retry_rate < 8 else "degraded",
                detail=f"Pic de {metrics.peak_active} requêtes simultanées; limite globale configurée à 6.",
            ),
            DataQualityMetric(
                key="api-5xx",
                label="Erreurs API 5xx",
                value=f"{api_error_rate:.2f} %",
                status="healthy" if api_error_rate < 1 else "degraded" if api_error_rate < 5 else "critical",
                detail=f"{reliability['total_5xx']} réponses 5xx sur {reliability['total_requests']} requêtes reçues.",
            ),
            DataQualityMetric(
                key="api-p95",
                label="Latence API p95",
                value=f"{float(reliability['p95_duration_ms']):.0f} ms",
                status="healthy" if float(reliability["p95_duration_ms"]) < 1500 else "degraded" if float(reliability["p95_duration_ms"]) < 4000 else "critical",
                detail=f"{reliability['slow_requests']} requêtes ont dépassé 2,5 secondes.",
            ),
            DataQualityMetric(
                key="uptime",
                label="Disponibilité du processus",
                value=f"{(monotonic() - _STARTED_AT) / 3600:.1f} h",
                status="neutral",
                detail="Temps écoulé depuis le démarrage du processus FastAPI courant.",
            ),
        ]

        endpoints = [
            DataQualityEndpoint(path="/health", label="Santé API", status="available", detail="Liveness locale sans dépendance externe."),
            DataQualityEndpoint(path="/api/v1/market/cockpit", label="Cockpit", status="available" if cockpit else "not_warmed", detail="Cache conservé en cas de panne temporaire."),
            DataQualityEndpoint(path="/api/v1/discovery/screener", label="Screener", status="available" if screener else "not_warmed", detail="Historique groupé et limitation de concurrence."),
            DataQualityEndpoint(path="/api/v1/discovery/etfs/{ticker}/holdings", label="Participations ETF", status="available", detail="Chargement à la demande avec cache de composition."),
            DataQualityEndpoint(path="/api/v1/discovery/ipo", label="IPO", status="available" if ipo else "not_warmed", detail="TMX et SEC EDGAR; dernières données conservées en secours."),
            DataQualityEndpoint(path="/api/v1/discovery/insiders", label="Initiés", status="available" if insider_service._snapshot_cache else "not_warmed", detail="Scans limités pour protéger l’API publique."),
            DataQualityEndpoint(path="/api/v1/analysis/terminal", label="Terminal Pro", status="available" if screener else "not_warmed", detail="Réutilise les caches Cockpit et Screener."),
            DataQualityEndpoint(path="/api/v1/workspace/portfolio", label="Portefeuille", status="available", detail="Analyse à la demande; positions stockées uniquement dans le navigateur."),
            DataQualityEndpoint(path="/api/v1/reliability/status", label="Observabilité v0.8", status="available", detail="Latence, taux 5xx, erreurs récentes et signalements bêta du processus courant."),
        ]

        return DataQualitySnapshot(
            overall_score=round(score, 1),
            overall_status=status,
            provider_mode="demo" if market_data_service.demo_mode else "public",
            uptime_seconds=round(monotonic() - _STARTED_AT, 1),
            metrics=metric_items,
            sources=sources,
            endpoints=endpoints,
            recommendations=recommendations,
            generated_at=datetime.now(UTC),
            refresh_after_seconds=60,
        )


data_quality_service = DataQualityService()
