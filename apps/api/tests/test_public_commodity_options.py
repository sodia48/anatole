from app.services.public_commodity_options import (
    CmePublicConfig,
    _ice_expirations,
    parse_cme_bulletin_text,
)


def test_parse_cme_public_rows_volume_and_open_interest() -> None:
    config = CmePublicConfig(
        urls=("https://example.invalid/report.pdf",),
        exchange="CME",
        header_phrases=("LIVE CATTLE CALL",),
        strike_divisor=10.0,
    )
    text = """
LIVE CATTLE CALLS
OCT26 LV CATTLE CALL (FUTURES SETT. 220.925 + 215.0 )
2200 1.77 2.72B 1.60A ---- 2.65 + 92 .576 ---- 170 2647 - 32 28.27B .95
2210 1.40 2.20B 1.25A ---- 2.10 + 77 .498 ---- 11 496 - 1 23.20B .82A
"""
    contracts = parse_cme_bulletin_text(text, root="LE", config=config)
    assert len(contracts) == 2
    first = contracts[0]
    assert first.strike == 220.0
    assert first.last == 2.65
    assert first.volume == 170
    assert first.open_interest == 2647
    assert first.delta == 0.576
    assert first.source == "CME Daily Bulletin EOD"
    assert first.delayed is True


def test_parse_cme_public_rows_zero_volume_positive_oi() -> None:
    config = CmePublicConfig(
        urls=("https://example.invalid/report.pdf",),
        exchange="COMEX",
        header_phrases=("GOLD OPTIONS",),
        strike_divisor=1.0,
    )
    text = """
OG PUT GOLD OPTIONS
SEP26
4000 ---- ---- ---- 0.20B/0.20A ---- 0.30 + 0.10 .0012 ---- ---- ---- ---- 62 UNCH
"""
    contracts = parse_cme_bulletin_text(text, root="GC", config=config)
    assert len(contracts) == 1
    assert contracts[0].volume == 0
    assert contracts[0].open_interest == 62


def test_ice_expiry_metadata_parsing() -> None:
    html = """
    <tr><td>Nov26</td><td>7/1/2026</td><td>10/9/2026</td></tr>
    <tr><td>Dec26</td><td>1/3/2025</td><td>11/13/2026</td></tr>
    """
    assert _ice_expirations(html) == ["2026-10-09", "2026-11-13"]


def test_parse_real_cme_gold_monthly_rows() -> None:
    config = CmePublicConfig(
        urls=("https://example.invalid/metals.pdf",),
        exchange="COMEX",
        header_phrases=("GOLD OPTIONS",),
        exclude_phrases=("MICRO", "WEEKLY"),
        strike_divisor=1.0,
    )
    text = """
OG CALL COMEX GOLD OPTIONS
OCT26
4250 42.70 42.70 123.60B/37.90A 123.60B/37.90A ---- 42.70 - 53.50 .8280 ---- ---- 3 ---- 431 - 1
4255 ---- ---- 118.70B/34.30A 118.70B/34.30A ---- 38.90 - 52.70 .7931 ---- ---- ---- ---- 56 UNCH
"""
    contracts = parse_cme_bulletin_text(text, root="GC", config=config)
    assert len(contracts) == 2
    first = contracts[0]
    assert first.strike == 4250.0
    assert first.last == 42.70
    assert first.volume == 3
    assert first.open_interest == 431
    assert first.delta == 0.828


def test_parse_cme_row_when_delta_is_missing() -> None:
    config = CmePublicConfig(
        urls=("https://example.invalid/metals.pdf",),
        exchange="COMEX",
        header_phrases=("GOLD OPTIONS",),
        exclude_phrases=("MICRO", "WEEKLY"),
        strike_divisor=1.0,
    )
    text = """
OG PUT COMEX GOLD OPTIONS
OCT26
1000 ---- ---- ---- ----/0.10A ---- 0.10 UNCH ---- ---- ---- ---- ---- 1 UNCH
"""
    contracts = parse_cme_bulletin_text(text, root="GC", config=config)
    assert len(contracts) == 1
    assert contracts[0].strike == 1000.0
    assert contracts[0].volume == 0
    assert contracts[0].open_interest == 1
    assert contracts[0].delta is None
