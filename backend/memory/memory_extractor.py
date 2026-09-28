"""Deterministic extraction of durable user facts from a message.

Airi must not store every sentence in long-term memory. Only explicit,
high-signal user statements are turned into persistent memories.
"""

from __future__ import annotations

import re
from typing import Any

MAX_VALUE_LENGTH = 120

# (regex, memory key, category)
FACT_PATTERNS: tuple[tuple[str, str, str], ...] = (
    (r"\bmy name is\s+([a-z][a-z'\- ]{1,40})", "user_name", "user_info"),
    (r"\bi am called\s+([a-z][a-z'\- ]{1,40})", "user_name", "user_info"),
    (r"\bi'm called\s+([a-z][a-z'\- ]{1,40})", "user_name", "user_info"),
    (r"\bcall me\s+([a-z][a-z'\- ]{1,40})", "user_name", "user_info"),
    (r"\bi live in\s+([a-z0-9][a-z0-9'\- ,]{1,60})", "user_location", "user_info"),
    (r"\bi'm from\s+([a-z0-9][a-z0-9'\- ,]{1,60})", "user_location", "user_info"),
    (r"\bi work as\s+(?:a|an)?\s*([a-z][a-z'\- ]{1,60})", "user_job", "user_info"),
    (r"\bi work at\s+([a-z0-9][a-z0-9'\- ,.&]{1,60})", "user_employer", "user_info"),
    (r"\bi study\s+([a-z0-9][a-z0-9'\- ,]{1,60})", "user_study", "user_info"),
    (r"\bmy favourite\s+([a-z][a-z'\- ]{1,40})\s+is\s+([^.!?]{1,60})", "", "preference"),
    (r"\bmy favorite\s+([a-z][a-z'\- ]{1,40})\s+is\s+([^.!?]{1,60})", "", "preference"),
    (r"\bi like\s+([^.!?]{1,60})", "user_likes", "preference"),
    (r"\bi love\s+([^.!?]{1,60})", "user_loves", "preference"),
    (r"\bi don't like\s+([^.!?]{1,60})", "user_dislikes", "preference"),
    (r"\bi hate\s+([^.!?]{1,60})", "user_dislikes", "preference"),
    (r"\bremember that\s+([^.!?]{3,100})", "remembered_note", "note"),
    (r"\bplease remember\s+([^.!?]{3,100})", "remembered_note", "note"),
)

REMEMBER_REQUEST = re.compile(
    r"\b(remember that|please remember|don't forget|do not forget)\b",
    re.IGNORECASE,
)


def _clean_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().strip(".,;:")


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def extract_long_term_facts(user_text: str) -> list[dict[str, Any]]:
    """Return durable facts worth remembering from a user message."""

    text = (user_text or "").strip().lower()

    if not text:
        return []

    facts: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for pattern, key, category in FACT_PATTERNS:
        match = re.search(pattern, text)

        if not match:
            continue

        groups = [group for group in match.groups() if group]

        if not groups:
            continue

        if category == "preference" and key == "":
            # "my favourite food is pizza" -> favourite_food = pizza
            subject = _clean_value(groups[0])
            value = _clean_value(groups[1])
            resolved_key = f"favourite_{_slug(subject)}" or "user_preference"
        else:
            resolved_key = key
            value = _clean_value(groups[0])

        if not value or len(value) > MAX_VALUE_LENGTH:
            continue

        if resolved_key in seen_keys:
            continue

        # Guard against capturing the rest of an unrelated sentence.
        if len(value.split()) > 12:
            continue

        seen_keys.add(resolved_key)

        facts.append(
            {
                "key": resolved_key or "user_preference",
                "value": value,
                "category": category,
                "confidence": 0.9,
            }
        )

    return facts


def is_remember_request(user_text: str) -> bool:
    return bool(REMEMBER_REQUEST.search(user_text or ""))
