from datetime import datetime, timezone
from typing import Any


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    def __init__(self, max_short_term: int = 50) -> None:
        self.max_short_term = max_short_term
        self._short_term: list[dict[str, Any]] = []
        self._long_term: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------
    # Short-term memory (current conversation window)
    # ------------------------------------------------------------------
    def save_short_term(self, role: str, content: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        cleaned = content.strip() if content else ""
        if not cleaned:
            return {}

        item = {
            "id": f"st_{len(self._short_term) + 1}",
            "role": role,
            "content": cleaned,
            "metadata": metadata or {},
            "timestamp": utc_iso_now(),
        }
        self._short_term.append(item)

        if len(self._short_term) > self.max_short_term:
            self._short_term = self._short_term[-self.max_short_term:]

        return item

    def get_short_term(self, limit: int | None = None) -> list[dict[str, Any]]:
        if limit is None or limit <= 0:
            return list(self._short_term)

        return list(self._short_term[-limit:])

    def clear_short_term(self) -> None:
        self._short_term = []

    # ------------------------------------------------------------------
    # Long-term memory (persistent user facts / preferences)
    # ------------------------------------------------------------------
    def save_long_term(self, key: str, value: str, category: str = "fact", confidence: float = 1.0) -> dict[str, Any]:
        cleaned_key = key.strip().lower()
        cleaned_value = value.strip()
        if not cleaned_key or not cleaned_value:
            return {}

        entry = {
            "key": cleaned_key,
            "value": cleaned_value,
            "category": category,
            "confidence": max(0.0, min(confidence, 1.0)),
            "updated_at": utc_iso_now(),
        }
        self._long_term[cleaned_key] = entry
        return entry

    def retrieve_long_term(self, key: str) -> dict[str, Any] | None:
        return self._long_term.get(key.strip().lower())

    def search_long_term(self, query: str = "", limit: int | None = None) -> list[dict[str, Any]]:
        if not query or not query.strip():
            results = list(self._long_term.values())
        else:
            q = query.strip().lower()
            results = []

            for key, entry in self._long_term.items():
                if (
                    q in key
                    or q in entry["value"].lower()
                    or q in entry["category"].lower()
                ):
                    results.append(entry)

        if limit is not None and limit > 0:
            return results[:limit]

        return results

    def relevant_long_term(self, text: str, limit: int = 6) -> list[dict[str, Any]]:
        """Return long-term memories relevant to a user message.

        Matching is token based so that a sentence such as
        "my favourite food is pizza" recalls the stored ``favourite_food``
        entry instead of returning every stored fact.
        """

        cleaned = (text or "").strip().lower()

        if not cleaned:
            return self.get_summary_context(limit)

        tokens = {
            token.strip(".,!?;:'\"()[]{}")
            for token in cleaned.split()
            if len(token.strip(".,!?;:'\"()[]{}")) >= 3
        }

        scored: list[tuple[int, dict[str, Any]]] = []

        for key, entry in self._long_term.items():
            haystack = f"{key} {entry['value']} {entry['category']}".lower()

            score = sum(1 for token in tokens if token in haystack)

            if score > 0:
                scored.append((score, entry))

        if not scored:
            return self.get_summary_context(limit)

        scored.sort(key=lambda item: item[0], reverse=True)

        return [entry for _score, entry in scored[:limit]]

    def delete_long_term(self, key: str) -> bool:
        cleaned_key = key.strip().lower()
        if cleaned_key in self._long_term:
            del self._long_term[cleaned_key]
            return True
        return False

    def clear_long_term(self) -> None:
        self._long_term = {}

    def clear(self) -> None:
        self._short_term = []
        self._long_term = {}

    def get_summary_context(self, max_items: int = 5) -> list[dict[str, Any]]:
        return list(self._long_term.values())[:max_items]


memory_store = MemoryStore()

