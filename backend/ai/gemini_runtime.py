"""Shared Gemini runtime helpers for Airi providers.

Centralises:
- client creation (single place that reads the API key),
- model candidate resolution from environment configuration,
- retry/back-off for transient Gemini failures (429 / 503 / timeouts),
- graceful fallback across model candidates.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from config import settings

TRANSIENT_STATUS_CODES = (429, 500, 502, 503, 504)
DEFAULT_MAX_ATTEMPTS_PER_MODEL = 2
DEFAULT_BACKOFF_SECONDS = 1.5


class GeminiUnavailableError(RuntimeError):
    """Raised when the Gemini API key is missing or unusable."""


def _split_models(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def get_model_candidates(env_var: str, default_model: str) -> list[str]:
    """Return an ordered, de-duplicated list of models to try.

    ``AIRI_<X>_MODEL`` may contain a comma separated fallback chain, e.g.
    ``gemini-3.8-flash,gemini-3.7-flash``. The default model is always the
    final fallback.
    """

    candidates = _split_models(os.getenv(env_var, "")) or [default_model]

    if default_model not in candidates:
        candidates.append(default_model)

    ordered: list[str] = []
    for model in candidates:
        if model not in ordered:
            ordered.append(model)

    return ordered


def _get_client() -> Any:
    if not settings.is_api_key_configured():
        raise GeminiUnavailableError("GEMINI_API_KEY is not configured.")

    from google import genai

    return genai.Client(api_key=settings.get_api_key())


def _status_code_of(error: BaseException) -> int | None:
    code = getattr(error, "code", None)

    if isinstance(code, int):
        return code

    response = getattr(error, "response", None)
    response_code = getattr(response, "status_code", None)

    if isinstance(response_code, int):
        return response_code

    message = str(error)

    for status in TRANSIENT_STATUS_CODES:
        if f" {status} " in f" {message} " or f"code': {status}" in message:
            return status

    return None


def _is_transient(error: BaseException) -> bool:
    if isinstance(error, (asyncio.TimeoutError, TimeoutError, ConnectionError)):
        return True

    status = _status_code_of(error)

    if status is not None:
        return status in TRANSIENT_STATUS_CODES

    name = type(error).__name__

    return name in {"ServerError", "TooManyRequests", "ServiceUnavailable"}


async def generate_content(
    *,
    model_env_var: str,
    default_model: str,
    contents: Any,
    config: Any | None = None,
    max_attempts_per_model: int = DEFAULT_MAX_ATTEMPTS_PER_MODEL,
    backoff_seconds: float = DEFAULT_BACKOFF_SECONDS,
) -> tuple[Any, str]:
    """Generate content, retrying transient failures and falling back models.

    Returns a ``(response, model_used)`` tuple.

    Raises:
        GeminiUnavailableError: when no API key is configured.
        Exception: the last error from Gemini when every candidate failed.
    """

    client = _get_client()
    candidates = get_model_candidates(model_env_var, default_model)

    last_error: BaseException | None = None

    for model in candidates:
        for attempt in range(max(1, max_attempts_per_model)):
            try:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                return response, model
            except Exception as error:  # noqa: BLE001 - surfaced to caller
                last_error = error

                if not _is_transient(error):
                    raise

                if attempt + 1 < max_attempts_per_model:
                    await asyncio.sleep(backoff_seconds * (attempt + 1))

    assert last_error is not None
    raise last_error


def generate_speech_bytes(
    *,
    text: str,
    voice: str,
    model_env_var: str,
    default_model: str,
) -> tuple[bytes, str, str]:
    """Synchronously synthesise speech with Gemini TTS.

    Returns ``(audio_bytes, mime_type, model_used)``.
    """

    client = _get_client()

    from google.genai import types

    candidates = get_model_candidates(model_env_var, default_model)
    last_error: BaseException | None = None

    speech_config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice,
                )
            )
        ),
    )

    for model in candidates:
        try:
            response = client.models.generate_content(
                model=model,
                contents=text,
                config=speech_config,
            )
        except Exception as error:  # noqa: BLE001 - surfaced to caller
            last_error = error
            if _is_transient(error):
                continue
            raise

        candidates_out = getattr(response, "candidates", None) or []

        for candidate in candidates_out:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) or []

            for part in parts:
                inline = getattr(part, "inline_data", None)
                data = getattr(inline, "data", None)

                if data:
                    mime_type = getattr(inline, "mime_type", None) or "audio/wav"
                    return bytes(data), mime_type, model

    if last_error is not None:
        raise last_error

    raise RuntimeError("Gemini TTS returned no audio data.")
