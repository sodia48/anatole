from app.schemas.province_series import ProvinceSeriesPoint
from app.services.province_series import forecast, lookbacks

def test_lookbacks_1_3_5_years():
    h=[ProvinceSeriesPoint(period=f"{y}-01-01",value=v) for y,v in [(2021,100),(2022,105),(2023,110),(2024,116),(2025,121),(2026,128)]]
    out=lookbacks(h,"percent")
    assert [x.years for x in out]==[1,3,5]
    assert all(x.change is not None for x in out)

def test_inflation_forecast_is_damped():
    h=[ProvinceSeriesPoint(period=f"{y}-01-01",value=v) for y,v in [(2022,2.0),(2023,2.5),(2024,3.0),(2025,3.3),(2026,3.5)]]
    out,method=forecast(h,"inflation_yoy","percent")
    assert method=="damped_linear_trend"
    assert [x.years_ahead for x in out]==[1,3,5]
    assert out[-1].value<15
