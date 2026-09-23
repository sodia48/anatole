from __future__ import annotations
import math, re
from datetime import UTC, datetime
import httpx
from app.schemas.province_series import ProvinceSeriesForecast, ProvinceSeriesLookback, ProvinceSeriesPoint, ProvinceSeriesSnapshot
from app.services.provincial_statistics import CPI_ALL_ITEMS_VECTOR_BY_CODE, METRICS, PROVINCE_BY_CODE, _history_from_points, _inflation_yoy_history, _point_list, _resolve_coordinate, provincial_statistics_service

def _spec(key):
    for s in METRICS:
        if s.key==key: return s
    raise ValueError("unknown_metric")

def _cadence(key): return "annual" if key=="real_gdp" else "quarterly" if key=="population" else "monthly"
def _depth(key):
    if key=="real_gdp": return 6,6
    if key=="population": return 21,21
    if key=="inflation_yoy": return 73,61
    return 61,61

def _year(period):
    m=re.match(r"^(\d{4})(?:-(\d{2}))?",str(period or ""))
    if not m: return None
    return int(m.group(1))+(int(m.group(2) or 1)-1)/12

def _delta(now,old,kind):
    if kind=="points": return now-old
    return None if old==0 else (now/old-1)*100

def lookbacks(history, kind):
    if not history: return [ProvinceSeriesLookback(years=y,change_kind="points" if kind=="points" else "percent") for y in (1,3,5)]
    last=history[-1]; ly=_year(last.period); out=[]
    for y in (1,3,5):
        best=None
        if ly is not None:
            cand=[(abs((_year(p.period) or 9999)-(ly-y)),p) for p in history[:-1] if _year(p.period) is not None]
            if cand:
                d,p=min(cand,key=lambda x:x[0]); best=p if d<=0.65 else None
        out.append(ProvinceSeriesLookback(years=y,change=_delta(last.value,best.value,kind) if best else None,change_kind="points" if kind=="points" else "percent",from_period=best.period if best else None,to_period=last.period))
    return out

def _slope(values):
    if len(values)<2:return 0.0
    mx=sum(x for x,_ in values)/len(values); my=sum(y for _,y in values)/len(values)
    den=sum((x-mx)**2 for x,_ in values)
    return 0.0 if den==0 else sum((x-mx)*(y-my) for x,y in values)/den

def forecast(history,key,unit):
    parsed=[(_year(p.period),p.value) for p in history]; parsed=[(x,y) for x,y in parsed if x is not None and math.isfinite(y)]
    if len(parsed)<2:return [],"insufficient_history"
    ly,lv=parsed[-1]; win=[p for p in parsed if p[0]>=ly-5.25] or parsed
    out=[]
    if unit=="percent":
        s=max(-2.5,min(2.5,_slope(win)))
        for h in (1,3,5):
            eff=sum(0.72**i for i in range(h)); v=lv+s*eff
            if key=="unemployment_rate":v=max(0,min(30,v))
            if key=="inflation_yoy":v=max(-3,min(15,v))
            out.append(ProvinceSeriesForecast(years_ahead=h,value=v,change_from_latest=v-lv,change_kind="points"))
        return out,"damped_linear_trend"
    fy,fv=win[0]; span=max(.25,ly-fy); g=0 if fv<=0 or lv<=0 else (lv/fv)**(1/span)-1
    cap={"population":.05,"employment":.08,"real_gdp":.12,"retail_sales":.15,"housing_starts":.20}.get(key,.15)
    g=max(-cap,min(cap,g))
    for h in (1,3,5):
        v=lv*((1+g)**h); out.append(ProvinceSeriesForecast(years_ahead=h,value=v,change_from_latest=(v/lv-1)*100 if lv else None,change_kind="percent"))
    return out,"five_year_cagr"

class ProvinceSeriesService:
    async def get(self,region,metric_key,lang):
        code=str(region or "").upper().strip()
        if code not in PROVINCE_BY_CODE: raise ValueError("unknown_province")
        spec=_spec(metric_key); province=PROVINCE_BY_CODE[code]; n,limit=_depth(metric_key)
        timeout=httpx.Timeout(connect=4,read=12,write=4,pool=4)
        async with httpx.AsyncClient(timeout=timeout,headers={"Accept":"application/json","User-Agent":"Anatole/Canada360-Series"},follow_redirects=True) as client:
            if metric_key=="inflation_yoy":
                vector=CPI_ALL_ITEMS_VECTOR_BY_CODE.get(code)
                payload=await provincial_statistics_service._post(client,"getDataFromVectorsAndLatestNPeriods",[{"vectorId":vector,"latestN":n}])
                response=payload[0] if isinstance(payload,list) and payload else payload
                hist=[ProvinceSeriesPoint(period=p.period,value=p.value) for p in _inflation_yoy_history(_point_list(response),limit=limit)]
            elif metric_key=="retail_sales":
                rows=(await provincial_statistics_service._retail_sales_rows(client)).get(province["en"],[])[-limit:]
                hist=[ProvinceSeriesPoint(period=p,value=v) for p,v in rows]
            else:
                meta=await provincial_statistics_service._metadata(client,spec.product_id)
                coord=_resolve_coordinate(meta,spec,province)
                if not coord: raise ValueError("series_unavailable")
                payload=await provincial_statistics_service._post(client,"getDataFromCubePidCoordAndLatestNPeriods",[{"productId":spec.product_id,"coordinate":coord,"latestN":n}])
                response=payload[0] if isinstance(payload,list) and payload else payload
                hist=[ProvinceSeriesPoint(period=p.period,value=p.value) for p in _history_from_points(_point_list(response),limit=limit)]
        if not hist: raise ValueError("series_unavailable")
        fc,method=forecast(hist,spec.key,spec.unit_kind); language="en" if str(lang).lower().startswith("en") else "fr"
        url=f"https://www150.statcan.gc.ca/t1/tbl1/{'en' if language=='en' else 'fr'}/tv.action?pid={spec.simple_view_pid}"
        note=("Indicative Anatole trend projection based on the latest five years of official history. It is not an official forecast or investment advice." if language=="en" else "Projection de tendance Anatole fondee sur les cinq dernieres annees d'historique officiel. Ce n'est pas une prevision officielle ni un conseil en placement.")
        return ProvinceSeriesSnapshot(province_code=code,province_name=province[language],metric_key=spec.key,metric_label=spec.label_en if language=="en" else spec.label_fr,unit=spec.unit_kind,cadence=_cadence(spec.key),source_name="Statistics Canada" if language=="en" else "Statistique Canada",source_url=url,history=hist,lookbacks=lookbacks(hist,spec.change_kind),forecasts=fc,forecast_method=method,forecast_note=note,generated_at=datetime.now(UTC))
province_series_service=ProvinceSeriesService()
