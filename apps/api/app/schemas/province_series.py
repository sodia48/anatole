from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

class ProvinceSeriesPoint(BaseModel):
    period: str
    value: float

class ProvinceSeriesLookback(BaseModel):
    years: Literal[1,3,5]
    change: float | None = None
    change_kind: Literal["percent","points"]
    from_period: str | None = None
    to_period: str | None = None

class ProvinceSeriesForecast(BaseModel):
    years_ahead: Literal[1,3,5]
    value: float
    change_from_latest: float | None = None
    change_kind: Literal["percent","points"]

class ProvinceSeriesSnapshot(BaseModel):
    province_code: str
    province_name: str
    metric_key: str
    metric_label: str
    unit: str
    cadence: Literal["monthly","quarterly","annual"]
    source_name: str
    source_url: str
    history: list[ProvinceSeriesPoint] = Field(default_factory=list)
    lookbacks: list[ProvinceSeriesLookback] = Field(default_factory=list)
    forecasts: list[ProvinceSeriesForecast] = Field(default_factory=list)
    forecast_method: str
    forecast_note: str
    generated_at: datetime
