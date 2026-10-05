"""Server-side, citation-preserving providers for Canada 360.

Providers normalize API responses; the assistant alone decides whether official
sources and the Precision Engine support a user-visible answer.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Literal, Protocol
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.services.canada_360_sources import identify_official_source


ProviderName = Literal["anthropic", "gemini", "openai"]
logger = logging.getLogger(__name__)
MAX_RESPONSE_BYTES = 1_000_000
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
OPENAI_URL = "https://api.openai.com/v1/responses"


@dataclass(frozen=True)
class ProviderEvidence:
    url: str
    title: str = "Official source"


@dataclass(frozen=True)
class ProviderResult:
    provider: ProviderName
    model: str
    answer: str = ""
    evidence: tuple[ProviderEvidence, ...] = ()
    usage: dict[str, int] = field(default_factory=dict)
    success: bool = False
    retryable: bool = False
    error_category: str | None = None


@dataclass(frozen=True)
class ProviderHealth:
    configured: bool
    reachable: bool
    model: str
    search_capable: bool


class Canada360Provider(Protocol):
    name: ProviderName
    model: str
    api_key: str

    @property
    def configured(self) -> bool: ...

    async def generate(
        self, *, prompt: str, domains: list[str], max_output_tokens: int = 1800,
    ) -> ProviderResult: ...


def _usage(payload: object) -> dict[str, int]:
    if not isinstance(payload, dict):
        return {}
    return {
        key: value for key, value in payload.items()
        if key in {"input_tokens", "output_tokens", "promptTokenCount", "candidatesTokenCount"}
        and isinstance(value, int) and not isinstance(value, bool)
    }


def _failure(name: ProviderName, model: str, category: str, retryable: bool = False) -> ProviderResult:
    return ProviderResult(
        provider=name, model=model, error_category=category, retryable=retryable,
    )


async def _post_json(
    *, name: ProviderName, model: str, url: str,
    headers: dict[str, str], payload: dict,
) -> dict | ProviderResult:
    timeout = settings.canada360_provider_timeout_seconds
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=min(8.0, timeout)),
            follow_redirects=False,
        ) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE_BYTES:
                        return _failure(name, model, "response_too_large")
                status = response.status_code
        if status in {401, 403}:
            return _failure(name, model, "auth")
        if status == 429:
            return _failure(name, model, "rate_limit", True)
        if status in {408, 500, 502, 503, 504}:
            return _failure(name, model, "server_error", True)
        if status in {400, 404}:
            # No raw error message or request headers leave this module.
            try:
                error = json.loads(body).get("error", {})
                code = error.get("code") if isinstance(error, dict) else None
            except (ValueError, TypeError, AttributeError):
                code = None
            category = "model_invalid" if code in {
                "model_not_found", "invalid_model", "NOT_FOUND",
            } or status == 404 else "request_invalid"
            return _failure(name, model, category)
        if not 200 <= status < 300:
            return _failure(name, model, "http_error")
        data = json.loads(body)
        if not isinstance(data, dict):
            return _failure(name, model, "invalid_response")
        return data
    except httpx.TimeoutException:
        return _failure(name, model, "timeout", True)
    except httpx.TransportError:
        return _failure(name, model, "transport", True)
    except (ValueError, TypeError):
        return _failure(name, model, "invalid_response")


def _evidence(rows: list[tuple[object, object]]) -> tuple[ProviderEvidence, ...]:
    seen: set[str] = set()
    result: list[ProviderEvidence] = []
    for raw_url, raw_title in rows:
        if not isinstance(raw_url, str) or raw_url in seen:
            continue
        seen.add(raw_url)
        result.append(ProviderEvidence(
            url=raw_url, title=str(raw_title or "Official source")[:180],
        ))
    return tuple(result)


class AnthropicProvider:
    name: ProviderName = "anthropic"

    @property
    def api_key(self) -> str:
        return settings.anthropic_api_key.strip()

    @property
    def model(self) -> str:
        return settings.canada360_anthropic_model.strip()

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)

    async def generate(
        self, *, prompt: str, domains: list[str], max_output_tokens: int = 1800,
    ) -> ProviderResult:
        if not self.configured:
            return _failure(self.name, self.model, "unconfigured")
        data = await _post_json(
            name=self.name, model=self.model, url=ANTHROPIC_URL,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            payload={
                "model": self.model,
                "max_tokens": max_output_tokens,
                "output_config": {"effort": "low"},
                "messages": [{"role": "user", "content": prompt}],
                "tools": [{
                    "type": "web_search_20250305", "name": "web_search",
                    "max_uses": 3, "allowed_domains": domains,
                }],
            },
        )
        if isinstance(data, ProviderResult):
            return data
        content = data.get("content")
        if not isinstance(content, list):
            return _failure(self.name, self.model, "invalid_response")
        if data.get("stop_reason") == "max_tokens":
            return _failure(self.name, self.model, "truncated_answer")
        text_parts: list[str] = []
        citations: list[tuple[object, object]] = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                text_parts.append(block["text"].strip())
                for citation in block.get("citations") or []:
                    if isinstance(citation, dict):
                        citations.append((citation.get("url"), citation.get("title")))
        answer = "\n\n".join(part for part in text_parts if part)
        return ProviderResult(
            provider=self.name, model=self.model, answer=answer,
            evidence=_evidence(citations), usage=_usage(data.get("usage")),
            success=bool(answer),
            error_category=None if answer else "empty_answer",
        )


async def _resolve_gemini_url(url: str) -> str | None:
    """Resolve only Google's grounding redirect, then validate its official target."""
    if identify_official_source(url):
        return url
    try:
        parsed = urlparse(url)
        valid_port = parsed.port in (None, 443)
    except ValueError:
        return None
    if (len(url) > 2048 or parsed.scheme != "https"
            or parsed.hostname != "vertexaisearch.cloud.google.com"
            or parsed.username or parsed.password or not valid_port
            or not parsed.path.startswith("/grounding-api-redirect/")):
        return None
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(5.0), follow_redirects=False,
        ) as client:
            response = await client.get(url)
        if response.status_code not in {301, 302, 303, 307, 308}:
            return None
        target = response.headers.get("location", "")
        return target if identify_official_source(target) else None
    except (httpx.HTTPError, ValueError):
        return None


class GeminiProvider:
    name: ProviderName = "gemini"

    @property
    def api_key(self) -> str:
        return settings.gemini_api_key.strip()

    @property
    def model(self) -> str:
        return settings.canada360_gemini_model.strip()

    @property
    def configured(self) -> bool:
        return bool(self.api_key and re.fullmatch(r"[A-Za-z0-9._-]+", self.model))

    async def generate(
        self, *, prompt: str, domains: list[str], max_output_tokens: int = 1800,
    ) -> ProviderResult:
        if not self.configured:
            return _failure(self.name, self.model, "unconfigured")
        data = await _post_json(
            name=self.name, model=self.model,
            url=f"{GEMINI_BASE_URL}/{self.model}:generateContent",
            headers={"x-goog-api-key": self.api_key, "content-type": "application/json"},
            payload={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "tools": [{"google_search": {}}],
                "generationConfig": {"maxOutputTokens": max_output_tokens},
            },
        )
        if isinstance(data, ProviderResult):
            return data
        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
            return _failure(self.name, self.model, "invalid_response")
        candidate = candidates[0]
        if candidate.get("finishReason") == "MAX_TOKENS":
            return _failure(self.name, self.model, "truncated_answer")
        content = candidate.get("content") or {}
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            return _failure(self.name, self.model, "invalid_response")
        answer = "\n\n".join(
            part["text"].strip() for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str)
            and part["text"].strip()
        )
        metadata = candidate.get("groundingMetadata") or {}
        chunks = metadata.get("groundingChunks") or [] if isinstance(metadata, dict) else []
        supports = metadata.get("groundingSupports") or [] if isinstance(metadata, dict) else []
        indices = {
            index for support in supports if isinstance(support, dict)
            for index in support.get("groundingChunkIndices", [])
            if isinstance(index, int) and not isinstance(index, bool)
        }
        rows: list[tuple[object, object]] = []
        for index in sorted(indices):
            if index < 0 or index >= len(chunks) or not isinstance(chunks[index], dict):
                continue
            web = chunks[index].get("web")
            if isinstance(web, dict) and isinstance(web.get("uri"), str):
                resolved = await _resolve_gemini_url(web["uri"])
                # Retain the untrusted URL if resolution fails: the shared
                # source audit then rejects the whole draft.
                rows.append((resolved or web["uri"], web.get("title")))
        return ProviderResult(
            provider=self.name, model=self.model, answer=answer,
            evidence=_evidence(rows), usage=_usage(data.get("usageMetadata")),
            success=bool(answer),
            error_category=None if answer else "empty_answer",
        )


class OpenAIProvider:
    name: ProviderName = "openai"

    @property
    def api_key(self) -> str:
        return settings.openai_api_key.strip()

    @property
    def model(self) -> str:
        return settings.canada360_openai_model.strip()

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)

    async def generate(
        self, *, prompt: str, domains: list[str], max_output_tokens: int = 1800,
    ) -> ProviderResult:
        if not self.configured:
            return _failure(self.name, self.model, "unconfigured")
        models = tuple(dict.fromkeys(filter(None, (
            self.model, settings.canada360_openai_fallback_model.strip(),
        ))))
        for model in models:
            data = await _post_json(
                name=self.name, model=model, url=OPENAI_URL,
                headers={"authorization": f"Bearer {self.api_key}", "content-type": "application/json"},
                payload={
                    "model": model,
                    "reasoning": {"effort": "low"},
                    "tools": [{"type": "web_search", "search_context_size": "high",
                               "filters": {"allowed_domains": domains}}],
                    "tool_choice": "required",
                    "include": ["web_search_call.action.sources"],
                    "input": prompt,
                    "max_output_tokens": max_output_tokens,
                    "store": False,
                },
            )
            if isinstance(data, ProviderResult):
                if data.error_category == "model_invalid" and model != models[-1]:
                    continue
                return data
            output = data.get("output")
            if not isinstance(output, list):
                return _failure(self.name, model, "invalid_response")
            if data.get("status") == "incomplete":
                return _failure(self.name, model, "truncated_answer")
            text_parts: list[str] = []
            citations: list[tuple[object, object]] = []
            for item in output:
                if not isinstance(item, dict) or item.get("type") != "message":
                    continue
                for content in item.get("content") or []:
                    if not isinstance(content, dict) or content.get("type") != "output_text":
                        continue
                    if isinstance(content.get("text"), str):
                        text_parts.append(content["text"].strip())
                    for citation in content.get("annotations") or []:
                        if isinstance(citation, dict):
                            citations.append((citation.get("url"), citation.get("title")))
            answer = "\n\n".join(part for part in text_parts if part)
            return ProviderResult(
                provider=self.name, model=model, answer=answer,
                evidence=_evidence(citations), usage=_usage(data.get("usage")),
                success=bool(answer),
                error_category=None if answer else "empty_answer",
            )
        return _failure(self.name, self.model, "model_invalid")


class Canada360ProviderRouter:
    def __init__(self) -> None:
        self._providers: dict[ProviderName, Canada360Provider] = {
            "anthropic": AnthropicProvider(),
            "gemini": GeminiProvider(),
            "openai": OpenAIProvider(),
        }
        self._cooldown: dict[ProviderName, tuple[float, str]] = {}
        self._timeouts: dict[ProviderName, int] = {}

    @property
    def configured_order(self) -> tuple[str, ...]:
        return settings.canada360_provider_order

    def _identity(self, provider: Canada360Provider) -> str:
        return hashlib.sha256(
            f"{provider.model}\0{provider.api_key}".encode()
        ).hexdigest()

    def circuit_open(self, provider: Canada360Provider) -> bool:
        state = self._cooldown.get(provider.name)
        if state and state[1] == self._identity(provider) and time.monotonic() < state[0]:
            return True
        self._cooldown.pop(provider.name, None)
        return False

    def available(self) -> list[Canada360Provider]:
        return [
            self._providers[name] for name in self.configured_order
            if name in self._providers and self._providers[name].configured
            and not self.circuit_open(self._providers[name])
        ]

    async def generate(
        self, provider: Canada360Provider, *, prompt: str, domains: list[str],
        max_output_tokens: int = 1800,
    ) -> ProviderResult:
        last = _failure(provider.name, provider.model, "unavailable")
        for attempt in range(settings.canada360_provider_retries + 1):
            started = time.monotonic()
            logger.info("canada360_path=provider_attempt provider=%s model=%s", provider.name, provider.model)
            try:
                last = await asyncio.wait_for(
                    provider.generate(
                        prompt=prompt, domains=domains, max_output_tokens=max_output_tokens,
                    ),
                    timeout=settings.canada360_provider_timeout_seconds,
                )
            except TimeoutError:
                last = _failure(provider.name, provider.model, "timeout", True)
            except Exception:  # noqa: BLE001 - fail over without exposing provider internals
                last = _failure(provider.name, provider.model, "provider_exception")
            seconds = time.monotonic() - started
            bucket = "<1s" if seconds < 1 else "<5s" if seconds < 5 else "<30s" if seconds < 30 else ">=30s"
            event = "provider_success" if last.success else "provider_failure"
            logger.info(
                "canada360_path=%s provider=%s model=%s latency_bucket=%s error_category=%s official_citations=%s",
                event, provider.name, last.model, bucket,
                last.error_category or "none",
                sum(identify_official_source(row.url) is not None for row in last.evidence),
            )
            if last.success:
                self._cooldown.pop(provider.name, None)
                self._timeouts.pop(provider.name, None)
                return last
            if last.retryable and attempt < settings.canada360_provider_retries:
                await asyncio.sleep(0.4 * (attempt + 1))
                continue
            break
        if last.error_category in {"auth", "model_invalid", "request_invalid"}:
            duration = max(300.0, settings.canada360_provider_circuit_breaker_seconds)
            self._cooldown[provider.name] = (time.monotonic() + duration, self._identity(provider))
        elif last.error_category in {"rate_limit", "server_error", "transport"}:
            self._cooldown[provider.name] = (
                time.monotonic() + settings.canada360_provider_circuit_breaker_seconds,
                self._identity(provider),
            )
        elif last.error_category == "timeout":
            self._timeouts[provider.name] = self._timeouts.get(provider.name, 0) + 1
            if self._timeouts[provider.name] >= 2:
                self._cooldown[provider.name] = (
                    time.monotonic() + settings.canada360_provider_circuit_breaker_seconds,
                    self._identity(provider),
                )
        return last

    async def health(self) -> dict:
        async def inspect(name: ProviderName) -> tuple[str, ProviderHealth]:
            provider = self._providers[name]
            if not provider.configured or self.circuit_open(provider):
                return name, ProviderHealth(provider.configured, False, provider.model, False)
            result = await self.generate(
                provider,
                prompt=("Find the official Government of Canada services page via web search. "
                        "Cite the page in a brief answer."),
                domains=["canada.ca"], max_output_tokens=180,
            )
            return name, ProviderHealth(
                True, result.success, provider.model,
                bool(result.success and any(
                    identify_official_source(item.url) for item in result.evidence
                )),
            )

        rows = await asyncio.gather(*(inspect(name) for name in self._providers))
        return {
            "configured_order": list(self.configured_order),
            "providers": {
                name: {
                    "configured": health.configured,
                    "reachable": health.reachable,
                    "model": health.model,
                    "search_capable": health.search_capable,
                }
                for name, health in rows
            },
        }


provider_router = Canada360ProviderRouter()
