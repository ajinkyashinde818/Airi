from datetime import datetime, timezone
from typing import Any


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConversationManager:

    def __init__(self, max_turns: int = 20) -> None:
        self.max_turns = max_turns
        self._history: list[dict[str, Any]] = []

    def add_message(self, role: str, content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if not cleaned:
            return {}

        msg = {
            "role": role,
            "content": cleaned,
            "timestamp": utc_iso_now(),
        }

        self._history.append(msg)

        if len(self._history) > self.max_turns:
            self._history = self._history[-self.max_turns :]

        return msg

    def get_history(self) -> list[dict[str, Any]]:
        return list(self._history)

    def clear(self) -> None:
        self._history = []


conversation_manager = ConversationManager()
