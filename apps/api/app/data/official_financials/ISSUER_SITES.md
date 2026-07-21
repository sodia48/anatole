# Issuer-site overrides

The crawler is generic. It first uses the official website included in the
issuer profile, then tries common investor-relations routes, robots.txt and
XML sitemaps.

`issuer_sites.json` is only an override layer. It does not contain financial
values and does not require company-specific Python code.

Example:

```json
{
  "issuers": {
    "ABC": {
      "website": "https://www.abc.example",
      "investor_pages": [
        "/investors/financial-results",
        "https://ir.abc.example/reports"
      ]
    }
  }
}
```

Only official company domains or investor-relations domains should be used.
