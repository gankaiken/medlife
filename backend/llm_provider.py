from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

import httpx

try:
    from anthropic import Anthropic
except Exception:  # pragma: no cover - optional in some local environments
    Anthropic = None

ModelTask = Literal["debrief", "patient", "triage"]
ProviderName = Literal["anthropic", "openai", "grafilab"]

ANTHROPIC_DEFAULTS: dict[ModelTask, str] = {
    "debrief": "claude-opus-4-7",
    "patient": "claude-3-5-haiku-latest",
    "triage": "claude-opus-4-7",
}

OPENAI_FAMILY_DEFAULTS: dict[ModelTask, str] = {
    "debrief": "gpt-4.1",
    "patient": "gpt-4.1-mini",
    "triage": "gpt-4.1-mini",
}


def _normalized_provider() -> str:
    raw = os.environ.get("MEDLIFE_LLM_PROVIDER", "anthropic").strip().lower()
    return raw or "anthropic"


def get_provider_name() -> ProviderName:
    provider = _normalized_provider()
    if provider in {"openai", "chatgpt"}:
        return "openai"
    if provider in {"grafilab", "grafi"}:
        return "grafilab"
    return "anthropic"


def provider_display_name() -> str:
    provider = get_provider_name()
    if provider == "openai":
        return "OpenAI"
    if provider == "grafilab":
        return "Grafilab"
    return "Anthropic"


def provider_missing_warning() -> str:
    provider = get_provider_name()
    if provider == "openai":
        return "OPENAI_API_KEY not configured. Using rule-based assessment."
    if provider == "grafilab":
        return "GRAFILAB_API_KEY or GRAFILAB_BASE_URL not configured. Using rule-based assessment."
    return "ANTHROPIC_API_KEY not configured. Using rule-based assessment."


def model_name_for(task: ModelTask) -> str:
    env_name = {
        "debrief": "MEDLIFE_DEBRIEF_MODEL",
        "patient": "MEDLIFE_TEXT_AI_PATIENT_MODEL",
        "triage": "MEDLIFE_TRIAGE_MODEL",
    }[task]
    configured = os.environ.get(env_name)
    if configured:
        return configured
    provider = get_provider_name()
    if provider == "anthropic":
        return ANTHROPIC_DEFAULTS[task]
    return OPENAI_FAMILY_DEFAULTS[task]


def is_provider_available() -> bool:
    provider = get_provider_name()
    if provider == "anthropic":
        return bool(os.environ.get("ANTHROPIC_API_KEY")) and Anthropic is not None
    if provider == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    return bool(os.environ.get("GRAFILAB_API_KEY") and grafilab_base_url())


def grafilab_base_url() -> str | None:
    raw = os.environ.get("GRAFILAB_BASE_URL") or os.environ.get("MEDLIFE_GRAFILAB_BASE_URL")
    if not raw:
        return None
    return raw.rstrip("/")


def openai_base_url() -> str:
    raw = os.environ.get("OPENAI_BASE_URL") or os.environ.get("MEDLIFE_OPENAI_BASE_URL")
    return (raw or "https://api.openai.com/v1").rstrip("/")


def _normalize_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    text_parts.append(item["text"])
                elif isinstance(item.get("content"), str):
                    text_parts.append(item["content"])
            elif isinstance(item, str):
                text_parts.append(item)
        return "\n".join(part for part in text_parts if part).strip()
    return ""


@dataclass
class TextGenerationClient:
    provider: ProviderName

    def generate_text(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        raise NotImplementedError


class AnthropicTextGenerationClient(TextGenerationClient):
    def __init__(self, api_key: str):
        if Anthropic is None:  # pragma: no cover - optional dependency guard
            raise RuntimeError("anthropic sdk unavailable")
        super().__init__(provider="anthropic")
        self._client = Anthropic(api_key=api_key)

    def generate_text(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        msg = self._client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text_blocks = [
            block.text
            for block in getattr(msg, "content", [])
            if getattr(block, "type", "") == "text"
        ]
        return "\n".join(text_blocks).strip()


class OpenAICompatibleTextGenerationClient(TextGenerationClient):
    def __init__(self, provider: ProviderName, api_key: str, base_url: str):
        super().__init__(provider=provider)
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(timeout=30.0)

    def generate_text(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        response = self._http.post(
            f"{self._base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            },
        )
        response.raise_for_status()
        payload = response.json()
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("empty openai-compatible response")
        message = choices[0].get("message") or {}
        text = _normalize_content(message.get("content"))
        if text:
            return text
        raise RuntimeError("empty openai-compatible message content")


def generate_text_with_client(
    client: Any,
    *,
    model: str,
    system: str,
    user: str,
    max_tokens: int,
    temperature: float,
) -> str:
    if client is None:
        raise RuntimeError("llm client not configured")
    if hasattr(client, "messages") and hasattr(client.messages, "create"):
        msg = client.messages.create(
            model=model,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text_blocks = [
            block.text
            for block in getattr(msg, "content", [])
            if getattr(block, "type", "") == "text"
        ]
        return "\n".join(text_blocks).strip()
    if hasattr(client, "generate_text"):
        return client.generate_text(
            model=model,
            system=system,
            user=user,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    raise RuntimeError("unsupported llm client shape")


_cached_client: TextGenerationClient | None = None
_cached_signature: tuple[str, str | None, str | None] | None = None


def _provider_signature() -> tuple[str, str | None, str | None]:
    provider = get_provider_name()
    if provider == "anthropic":
        return (provider, os.environ.get("ANTHROPIC_API_KEY"), None)
    if provider == "openai":
        return (provider, os.environ.get("OPENAI_API_KEY"), openai_base_url())
    return (provider, os.environ.get("GRAFILAB_API_KEY"), grafilab_base_url())


def get_text_generation_client() -> TextGenerationClient | None:
    global _cached_client, _cached_signature
    signature = _provider_signature()
    if _cached_client is not None and _cached_signature == signature:
        return _cached_client

    provider = get_provider_name()
    try:
        if provider == "anthropic":
            key = os.environ.get("ANTHROPIC_API_KEY")
            if not key:
                _cached_client = None
            else:
                _cached_client = AnthropicTextGenerationClient(key)
        elif provider == "openai":
            key = os.environ.get("OPENAI_API_KEY")
            if not key:
                _cached_client = None
            else:
                _cached_client = OpenAICompatibleTextGenerationClient(provider, key, openai_base_url())
        else:
            key = os.environ.get("GRAFILAB_API_KEY")
            base_url = grafilab_base_url()
            if not key or not base_url:
                _cached_client = None
            else:
                _cached_client = OpenAICompatibleTextGenerationClient(provider, key, base_url)
    except Exception:
        _cached_client = None

    _cached_signature = signature
    return _cached_client


def provider_debug_snapshot() -> dict[str, Any]:
    provider = get_provider_name()
    return {
        "provider": provider,
        "display_name": provider_display_name(),
        "available": is_provider_available(),
        "models": {
            "debrief": model_name_for("debrief"),
            "patient": model_name_for("patient"),
            "triage": model_name_for("triage"),
        },
        "openai_base_url": openai_base_url() if provider == "openai" else None,
        "grafilab_base_url": grafilab_base_url() if provider == "grafilab" else None,
    }
