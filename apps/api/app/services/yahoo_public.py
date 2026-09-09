"""One cookie/credential lifecycle for Yahoo public JSON feeds."""
from __future__ import annotations

import asyncio
from time import monotonic
from typing import Any

import httpx

from app.core.resilience import shared_http_client


class YahooPublicService:
    def __init__(self) -> None:
        self._crumb: str | None = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def credentials(self) -> str:
        async with self._lock:
            if self._crumb is not None and monotonic() < self._expires_at:
                return self._crumb
            try:
                await shared_http_client.request("GET", "https://fc.yahoo.com", attempts=1)
            except httpx.HTTPStatusError:
                # The cookie endpoint can set its cookie on a 404 response.
                pass
            response = await shared_http_client.request(
                "GET", "https://query1.finance.yahoo.com/v1/test/getcrumb", attempts=1,
            )
            crumb = response.text.strip()
            if not crumb or "<" in crumb or any(char.isspace() for char in crumb):
                raise ValueError("Yahoo public credential unavailable")
            self._crumb = crumb
            self._expires_at = monotonic() + 1800
            return crumb

    async def request_json(
        self, path: str, *, params: dict[str, Any] | None = None,
        method: str = "GET", body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        for attempt in range(2):
            crumb = await self.credentials()
            try:
                for host in ("query1", "query2"):
                    try:
                        response = await shared_http_client.request(
                            method, f"https://{host}.finance.yahoo.com{path}",
                            params={"formatted": "false", "lang": "en-CA", "region": "CA",
                                    **(params or {}), "crumb": crumb},
                            **({"json": body} if body is not None else {}), attempts=1,
                        )
                        break
                    except httpx.HTTPStatusError as exc:
                        if host == "query2" or exc.response.status_code not in {500, 502, 503, 504}:
                            raise
                    except httpx.TransportError:
                        if host == "query2":
                            raise
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("Expected Yahoo JSON object")
                return payload
            except httpx.HTTPStatusError as exc:
                if attempt or exc.response.status_code not in {401, 403}:
                    raise
                async with self._lock:
                    if self._crumb == crumb:
                        self._crumb = None
        raise RuntimeError("Yahoo request failed")


yahoo_public_service = YahooPublicService()
