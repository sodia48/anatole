from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.assistant_context import AssistantContext, UnifiedAssistantRequest
from app.schemas.etf_history import EtfHistoryPoint
from app.services.anatole_assistant_orchestrator import AnatoleAssistantOrchestrator
from app.services.assistant_etf_history import HORIZONS, history_query
from app.services.etf_history import build_history_snapshot, etf_history_service, normalize_etf_symbol


@pytest.fixture
def histories(monkeypatch):
    calls = []
    async def snapshot(symbol, horizon, **kwargs):
        calls.append((symbol, horizon, kwargs))
        months = HORIZONS[horizon][0]
        end = pd.Timestamp(datetime.now(UTC)).normalize()
        start = end - pd.DateOffset(months=months)
        dates = pd.date_range(start, end, freq='B')
        growth = {'VFV': 1.8, 'XIC': 1.4, 'XIU': 1.3, 'SPY': 1.6, 'QQQ': 2., 'VOO': 1.59}.get(symbol, 1.2)
        points = [EtfHistoryPoint(timestamp=d.to_pydatetime(), open=100, high=200, low=90,
                   close=100 * (1+(growth-1)*i/(len(dates)-1)), volume=1000) for i,d in enumerate(dates)]
        us = symbol in {'SPY','QQQ','VOO'}
        result = build_history_snapshot(ticker=symbol, normalized_symbol=normalize_etf_symbol(symbol),
            selected_range=horizon, points=points, currency='USD' if us else 'CAD')
        result.native_currency = result.currency
        result.exchange = 'NMS' if symbol == 'QQQ' else 'PCX' if us else 'TOR'
        result.interval = '1d'
        return result
    monkeypatch.setattr(etf_history_service, 'snapshot', snapshot)
    return calls, snapshot


@pytest.mark.asyncio
@pytest.mark.parametrize('question,region,intent', [
    ('Quel ETF canadien a été le plus performant sur 5 ans ?', 'CA', 'etf_ranking'),
    ('Quel ETF américain a été le plus performant sur 5 ans ?', 'US', 'etf_ranking'),
    ('Compare VFV, XIC et XIU sur 5 ans.', 'CA', 'etf_comparison'),
    ('Quel rendement pour VFV sur 1 an ?', 'CA', 'etf_performance'),
])
async def test_explicit_history_overrides_page_and_uses_verified_prices(histories, question, region, intent):
    response = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message=question,
        context=AssistantContext(surface='stock', symbol='SHOP')))
    assert response.intent == intent
    assert not response.permission_required
    assert 'Rendement du prix' in response.answer
    assert 'dividendes exclus' in response.answer
    assert 'CAGR' in response.answer
    assert '| ETF |' in response.answer
    assert 'TSX 60' not in response.answer
    assert 'RSI' not in response.answer
    assert all(call[2]['native_currency'] for call in histories[0])
    assert all((symbol in {'SPY','QQQ','VOO'}) == (region == 'US') for symbol,_,_ in histories[0])
    assert all(s.url and s.timestamp for s in response.evidence[0].sources)
    assert response.synthesis_mode == 'deterministic'


@pytest.mark.asyncio
async def test_followup_keeps_all_three_etfs_and_ignores_new_page_context(histories):
    service = AnatoleAssistantOrchestrator()
    first = await service.answer(UnifiedAssistantRequest(message='Compare VFV, XIC et XIU sur 5 ans.'))
    second = await service.answer(UnifiedAssistantRequest(message='Et sur 3 ans ?', conversation_id=first.conversation_id,
        context=AssistantContext(surface='stock', symbol='RY')))
    assert second.intent == 'etf_comparison'
    assert second.evidence[0].entities == ['VFV', 'XIC', 'XIU']
    assert [horizon for _,horizon,_ in histories[0][-3:]] == ['3y']*3
    assert len(second.evidence[0].facts) == 3
    assert second.actions[-1].href.endswith('symbols=VFV,XIC,XIU')


@pytest.mark.asyncio
@pytest.mark.parametrize('mode', ['short', 'outage', 'currency', 'exchange', 'basis', 'stale_dates'])
async def test_invalid_or_incomplete_history_is_excluded(histories, monkeypatch, mode):
    original = histories[1]
    async def snapshot(symbol, horizon, **kwargs):
        if symbol != 'VFV':
            return await original(symbol, horizon, **kwargs)
        if mode == 'outage':
            raise TimeoutError()
        row = await original(symbol, horizon, **kwargs)
        if mode == 'short': row.points = row.points[-10:]
        if mode == 'currency': row.currency = 'USD'
        if mode == 'exchange': row.exchange = None
        if mode == 'basis': row.return_basis = 'total'
        if mode == 'stale_dates': row.points = row.points[:-60]
        return row
    monkeypatch.setattr(etf_history_service, 'snapshot', snapshot)
    response = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message='Compare VFV et XIC sur 5 ans'))
    assert response.intent == 'etf_comparison'
    assert len(response.evidence[0].facts) == 1
    assert response.evidence[0].facts[0].label.startswith('XIC')
    assert any(item.startswith('VFV:') for item in response.evidence[0].missing_data)


@pytest.mark.asyncio
async def test_total_requested_never_relabelled_or_ranked(histories):
    response = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message='Compare le rendement total de VFV et XIC sur 5 ans'))
    assert 'sans classement' in response.answer
    assert '| — | VFV' in response.answer
    assert 'meilleur rendement' not in response.answer


@pytest.mark.asyncio
async def test_mixed_currencies_are_not_ranked(histories):
    response = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message='Compare VFV et QQQ sur 5 ans'))
    assert 'Devises différentes' in response.answer
    assert '| — |' in response.answer


@pytest.mark.asyncio
async def test_all_sources_down_remains_valid(histories, monkeypatch):
    async def down(*args, **kwargs): raise ConnectionError()
    monkeypatch.setattr(etf_history_service, 'snapshot', down)
    response = await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message='Quel ETF américain a le mieux performé sur 5 ans ?'))
    assert response.intent == 'etf_ranking'
    assert not response.evidence[0].facts
    assert 'Aucun classement fiable' in response.answer
    assert len(response.evidence[0].missing_data) == 3


@pytest.mark.parametrize('horizon', list(HORIZONS))
def test_all_requested_horizons(horizon):
    query = history_query('Quel ETF canadien a le meilleur rendement sur '+HORIZONS[horizon][1]+' ?', AssistantContext())
    assert query.horizon == horizon


def test_ambiguous_ranking_is_not_market_sentiment():
    query = history_query('Quel est l’ETF le plus performant sur les 5 dernières années ?', AssistantContext(surface='market'))
    assert query.skill == 'etf_ranking'
    assert query.horizon == '5y'
    assert query.region is None


def test_real_http_etf_history_intent(histories):
    with TestClient(app) as client:
        response = client.post('/api/v1/assistant/chat',json={'message':'Compare VFV, XIC et XIU sur 5 ans.',
            'context':{'surface':'canada360','route':'/canada'}})
    assert response.status_code == 200
    assert response.json()['intent'] == 'etf_comparison'
    assert len(response.json()['evidence'][0]['facts']) == 3

@pytest.mark.asyncio
async def test_native_history_retains_us_listing_currency_and_separate_cache(monkeypatch):
    from app.services import etf_history as module
    calls = []
    def fetch(symbol, spec):
        calls.append(symbol)
        return pd.DataFrame({'Open':[100,110],'High':[100,110],'Low':[100,110],'Close':[100,110]},
                            index=pd.to_datetime(['2026-01-01','2026-02-01'])), 'USD', 'PCX'
    async def convert(currency, timestamps):
        return {t:1.4 for t in timestamps}
    monkeypatch.setattr(module,'_fetch_history_sync',fetch)
    monkeypatch.setattr(module.currency_conversion_service,'rates_to_cad',convert)
    service=module.EtfHistoryService()
    native=await service.snapshot('SPY','1y',native_currency=True)
    legacy=await service.snapshot('SPY','1y')
    assert calls==['SPY','SPY']
    assert native.currency=='USD' and native.exchange=='PCX'
    assert native.last_close==110
    assert legacy.currency=='CAD' and legacy.last_close==154
    assert native.return_basis=='price'


@pytest.mark.asyncio
async def test_recent_cached_history_is_marked_stale_after_refresh_failure(monkeypatch):
    from app.services import etf_history as module
    def fetch(symbol,spec):
        return pd.DataFrame({'Open':[100],'High':[100],'Low':[100],'Close':[100]},index=pd.to_datetime(['2026-10-09'])), 'CAD','TOR'
    monkeypatch.setattr(module,'_fetch_history_sync',fetch)
    service=module.EtfHistoryService()
    first=await service.snapshot('VFV','1y',native_currency=True)
    def down(*args): raise ConnectionError()
    monkeypatch.setattr(module,'_fetch_history_sync',down)
    stale=await service.snapshot('VFV','1y',native_currency=True,force_refresh=True)
    assert stale.stale
    assert stale.generated_at==first.generated_at

@pytest.mark.asyncio
async def test_unsupported_horizon_is_not_silently_replaced(histories):
    response=await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message='Quel ETF canadien a le meilleur rendement sur 2 ans ?'))
    assert response.intent=='etf_ranking'
    assert 'Horizons disponibles' in response.answer
    assert not histories[0]


@pytest.mark.asyncio
async def test_calculated_return_and_cagr_are_grounded(histories):
    response=await AnatoleAssistantOrchestrator().answer(UnifiedAssistantRequest(message='Compare VFV et XIC sur 5 ans'))
    assert response.evidence[0].facts[0].value.startswith('80.000000%')
    assert '| 1 | VFV (TOR) | +80.00 % | +12.' in response.answer
    assert 'cours final / cours initial' in response.answer
    assert all(f.timestamp for f in response.evidence[0].facts)

@pytest.mark.asyncio
async def test_native_long_history_uses_daily_observation_dates(monkeypatch):
    from app.services import etf_history as module
    seen=[]
    def fetch(symbol,spec):
        seen.append(spec.interval)
        return pd.DataFrame({'Open':[100],'High':[100],'Low':[100],'Close':[100]},index=pd.to_datetime(['2026-10-09'])), 'CAD','TOR'
    monkeypatch.setattr(module,'_fetch_history_sync',fetch)
    service=module.EtfHistoryService()
    native=await service.snapshot('VFV','5y',native_currency=True)
    chart=await service.snapshot('VFV','5y')
    assert seen==['1d','1wk']
    assert native.interval=='1d' and chart.interval=='1wk'
