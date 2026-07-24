from app.services.ipo import (
    classify_instrument,
    deduplicate_ipo_items,
    extract_sec_primary_document_url,
    parse_sec_atom,
    parse_sec_offer_price,
    parse_tmx_issue_price,
    parse_tmx_listings,
)

TMX_HTML = """
<table>
<tr><th>Date</th><th>Company</th></tr>
<tr><td>July 15, 2026</td><td>Ni-Co Energy Inc. (NICE)</td></tr>
<tr><td>July 13, 2026</td><td>Evolve Canadian Financials Yield Fund (CFIN)</td></tr>
</table>
"""

TMX_DETAIL_HTML = """
<html><body><table>
<tr><td>Issuer:</td><td>AGT Food and Ingredients Inc.</td></tr>
<tr><td>Issue price per security:</td><td>$23.00</td></tr>
<tr><td>Trading currency:</td><td>CDN$</td></tr>
</table></body></html>
"""

SEC_ATOM = """<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>S-1MEF - Example Holdings Inc. (0001234567) (Filer)</title>
<updated>2026-07-20T16:15:00-04:00</updated>
<link href="https://www.sec.gov/Archives/example-index.htm"/>
</entry>
</feed>
"""

SEC_INDEX_HTML = """
<table class="tableFile">
<tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
<tr><td>1</td><td>Prospectus</td><td><a href="form424b4.htm">form424b4.htm</a></td><td>424B4</td></tr>
</table>
"""

SEC_FINAL_HTML = """
<html><body>
<p>The initial public offering price is $16.00 per share of common stock.</p>
</body></html>
"""

SEC_RANGE_HTML = """
<html><body>
<p>We currently estimate that the initial public offering price will be between
$14.00 and $16.00 per share.</p>
</body></html>
"""

SEC_REFERENCE_HTML = """
<html><body>
<p>Assumed initial public offering price of US$12.50 per share.</p>
</body></html>
"""


def test_tmx_parser_and_price() -> None:
    items = parse_tmx_listings(TMX_HTML)
    assert len(items) == 2
    assert items[0].symbol == "NICE"
    assert items[0].instrument_type == "company"
    assert items[1].instrument_type == "fund"

    price = parse_tmx_issue_price(
        TMX_DETAIL_HTML,
        "https://www.tsx.com/example",
    )
    assert price.status == "final"
    assert price.price == 23
    assert price.currency == "CAD"
    assert price.label == "23.00 CAD"


def test_sec_atom_parser_cleans_title() -> None:
    items = parse_sec_atom(SEC_ATOM, "S-1")
    assert len(items) == 1
    assert items[0].country == "États-Unis"
    assert items[0].company == "Example Holdings Inc."


def test_sec_final_range_and_reference_prices() -> None:
    final = parse_sec_offer_price(SEC_FINAL_HTML)
    assert final.status == "final"
    assert final.price == 16
    assert final.currency == "USD"

    price_range = parse_sec_offer_price(SEC_RANGE_HTML)
    assert price_range.status == "range"
    assert price_range.low == 14
    assert price_range.high == 16
    assert price_range.currency == "USD"

    reference = parse_sec_offer_price(SEC_REFERENCE_HTML)
    assert reference.status == "reference"
    assert reference.price == 12.5
    assert reference.currency == "USD"


def test_sec_primary_document_url() -> None:
    url = extract_sec_primary_document_url(
        SEC_INDEX_HTML,
        "https://www.sec.gov/Archives/edgar/data/1/2/filing-index.htm",
    )
    assert url == "https://www.sec.gov/Archives/edgar/data/1/2/form424b4.htm"


def test_classification_and_deduplication() -> None:
    assert classify_instrument("Hamilton Canadian Equity ETF") == "etf"
    assert classify_instrument("Microsoft CDR (CAD Hedged)") == "cdr"
    items = parse_tmx_listings(TMX_HTML)
    assert len(deduplicate_ipo_items(items + items)) == len(items)
