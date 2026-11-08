import io

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.services.public_commodity_options import (
    CmePublicConfig,
    _CME_PUBLIC,
    _extract_pdf_text,
    _ice_expirations,
    parse_cme_bulletin_text,
)
from app.services.options import _apply_black_scholes_metrics, _merge_provider_metrics


def _synthetic_pdf(pages: list[list[str]]) -> bytes:
    """Generated test-only text; these are not copies of exchange bulletins."""
    writer = PdfWriter()
    font = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Courier"),
    }))
    for lines in pages:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        stream = DecodedStreamObject()
        commands = ["BT /F1 10 Tf 30 740 Td 14 TL"]
        for line in lines:
            safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.append(f"({safe}) Tj T*")
        commands.append("ET")
        stream.set_data("\n".join(commands).encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


@pytest.mark.parametrize(("root", "heading"), [
    ("RB", "RBOB GASOLINE"),
    ("GC", "GOLD OPTIONS"),
    ("ZC", "CORN"),
    ("LE", "LIVE CATTLE"),
    ("LBR", "LUMBER"),
])
def test_synthetic_multipage_pdf_does_not_invent_contract_details(root, heading):
    pdf = _synthetic_pdf([
        [f"{heading} CALL", "NOV27", "100 1.00 1.00 UNCH .5 ---- 0 10 UNCH"],
        [f"{heading} PUT", "NOV27", "110 1.00 2.00 UNCH ---- ---- ---- 11 UNCH"],
    ])
    rows = parse_cme_bulletin_text(_extract_pdf_text(pdf), root=root, config=_CME_PUBLIC[root])
    assert len(rows) == 2
    call = next(row for row in rows if row.side == "call")
    put = next(row for row in rows if row.side == "put")
    assert call.contract == put.contract == "2027-11"
    assert call.expiration is None and put.expiration is None
    assert call.last is None and call.settlement == 1.0
    assert call.volume == 0 and call.open_interest == 10
    assert put.volume is None and put.open_interest == 11


def test_unknown_expiry_is_not_used_for_greeks_or_provider_matching():
    rows = parse_cme_bulletin_text(
        "GOLD OPTIONS CALL\nNOV27\n100 1.00 1.00 UNCH ---- ---- 0 10 UNCH",
        root="GC", config=_CME_PUBLIC["GC"],
    )
    provider = rows[0].model_copy(update={"delta": 0.8})
    assert _apply_black_scholes_metrics(rows, underlying_price=100, risk_free_rate=0.03) == 0
    assert _merge_provider_metrics(rows, [provider]) == 0
    assert rows[0].delta is None


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
    assert first.last is None and first.settlement == 2.65
    assert first.expiration is None and first.contract == "2026-10"
    assert first.symbol.startswith("CME-EOD-ROW|")
    assert first.volume == 170
    assert first.open_interest == 2647
    assert first.delta == 0.576
    assert first.source == "CME Daily Bulletin EOD"
    assert first.delayed is True


def test_parse_cme_public_rows_missing_volume_positive_oi() -> None:
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
    assert contracts[0].volume is None
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
    assert first.last is None and first.settlement == 42.70
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
    assert contracts[0].volume is None
    assert contracts[0].open_interest == 1
    assert contracts[0].delta is None
