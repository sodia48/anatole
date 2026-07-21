# Official issuer filings registry

This directory is the normalized ingestion layer for TSX Composite companies
whose official statements are not available through SEC EDGAR CompanyFacts.

Do not add issuer-specific Python code. Add a record to `registry.json`.

Minimal structure:

```json
{
  "issuers": {
    "ABC": {
      "name": "ABC Inc.",
      "annual": [],
      "quarterly": [
        {
          "period_end": "2026-03-31",
          "currency": "CAD",
          "total_revenue": 100000000,
          "net_income": 10000000,
          "total_cash": 25000000,
          "total_debt": 40000000,
          "total_assets": 300000000,
          "total_liabilities": 180000000,
          "stockholder_equity": 120000000,
          "source": {
            "name": "ABC Q1 2026 Interim Financial Statements",
            "url": "https://issuer.example/q1-2026.pdf",
            "filed_at": "2026-05-05",
            "form": "Interim financial statements"
          }
        }
      ]
    }
  }
}
```

Only values found in an official issuer or regulatory filing should be entered.
Missing fields must be omitted, never estimated.
