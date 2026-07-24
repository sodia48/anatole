from app.services.ipo import (
    classify_instrument,
    deduplicate_ipo_items,
    parse_sec_atom,
    parse_tmx_listings,
)

TMX_HTML = """
<table>
<tr><th>Date</th><th>Company</th></tr>
<tr><td>July 15, 2026</td><td>Ni-Co Energy Inc. (NICE)</td></tr>
<tr><td>July 13, 2026</td><td>Evolve Canadian Financials Yield Fund (CFIN)</td></tr>
</table>
"""

SEC_ATOM = """<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>S-1 - Example Holdings Inc. (CIK 0001234567)</title>
<updated>2026-07-20T16:15:00-04:00</updated>
<link href="https://www.sec.gov/Archives/example-index.htm"/>
</entry>
</feed>
"""


def test_tmx_parser() -> None:
    items = parse_tmx_listings(TMX_HTML)
    assert len(items) == 2
    assert items[0].symbol == "NICE"
    assert items[0].instrument_type == "company"
    assert items[1].instrument_type == "fund"


def test_sec_atom_parser() -> None:
    items = parse_sec_atom(SEC_ATOM, "S-1")
    assert len(items) == 1
    assert items[0].country == "États-Unis"
    assert items[0].company == "Example Holdings Inc."


def test_classification_and_deduplication() -> None:
    assert classify_instrument("Hamilton Canadian Equity ETF") == "etf"
    assert classify_instrument("Microsoft CDR (CAD Hedged)") == "cdr"
    items = parse_tmx_listings(TMX_HTML)
    assert len(deduplicate_ipo_items(items + items)) == len(items)
