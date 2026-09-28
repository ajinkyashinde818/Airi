"""Centralised Airi backend configuration.

Every environment-dependent value used by the backend is resolved here so that
no API key, model name, port or URL is hardcoded inside feature modules.
"""

from __future__ import annotations

import os
from typing import Final

PLACEHOLDER_MARKERS: Final[tuple[str, ...]] = (
    "your_gemini_api_key_here",
    "your_api_key_here",
    "changeme",
    "placeholder",
)

DEFAULT_BRAIN_MODEL: Final[str] = "gemini-3.8-flash"
DEFAULT_VISION_MODEL: Final[str] = "gemini-3.8-flash"
DEFAULT_STT_MODEL: Final[str] = "gemini-3.8-flash"
DEFAULT_TTS_MODEL: Final[str] = "gemini-3.8-flash-tts"

DEFAULT_CORS_ORIGINS: Final[str] = (
    "http://localhost:5173,http://127.0.0.1:5173"
)


def _clean(value: str | None) -> str:
    return value.strip() if value else ""


def get_api_key() -> str:
    """Return the configured Gemini API key, or an empty string if unset."""
    return _clean(os.getenv("GEMINI_API_KEY"))


def is_api_key_configured() -> bool:
    """True when a non-placeholder API key is present."""
    key = get_api_key()

    if not key:
        return False

    lowered = key.lower()

    return not any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def get_brain_model() -> str:
    return _clean(os.getenv("AIRI_BRAIN_MODEL")) or DEFAULT_BRAIN_MODEL


def get_vision_model() -> str:
    return _clean(os.getenv("AIRI_VISION_MODEL")) or DEFAULT_VISION_MODEL


def get_stt_model() -> str:
    return _clean(os.getenv("AIRI_STT_MODEL")) or DEFAULT_STT_MODEL


def get_tts_model() -> str:
    return _clean(os.getenv("AIRI_TTS_MODEL")) or DEFAULT_TTS_MODEL


def get_tts_voice() -> str:
    return _clean(os.getenv("AIRI_TTS_VOICE")) or "Kore"


def get_gemini_timeout_seconds() -> float:
    try:
        return float(os.getenv("AIRI_GEMINI_TIMEOUT_SECONDS", "20"))
    except ValueError:
        return 20.0


def get_cors_origins() -> list[str]:
    raw = _clean(os.getenv("AIRI_CORS_ORIGINS")) or DEFAULT_CORS_ORIGINS

    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]

    return origins or [origin.strip() for origin in DEFAULT_CORS_ORIGINS.split(",")]


def get_short_term_memory_limit() -> int:
    try:
        return int(os.getenv("AIRI_SHORT_TERM_MEMORY_LIMIT", "40"))
    except ValueError:
        return 40


def get_long_term_memory_limit() -> int:
    try:
        return int(os.getenv("AIRI_LONG_TERM_MEMORY_LIMIT", "50"))
    except ValueError:
        return 50


def get_visual_change_ttl_seconds() -> int:
    try:
        return int(os.getenv("AIRI_VISUAL_CHANGE_TTL_SECONDS", "300"))
    except ValueError:
        return 300
