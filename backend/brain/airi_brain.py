from typing import Any

from brain.conversation_manager import conversation_manager
from brain.emotion_engine import emotion_engine as default_emotion_engine
from brain.providers.gemini_brain import GeminiBrainEngine
from config import settings
from memory.memory_extractor import extract_long_term_facts
from memory.memory_store import memory_store as default_memory_store
from vision.visual_context import visual_context_store


class AiriBrain:
    """Central reasoning layer.

    Receives the user message plus the currently relevant short-term memory,
    long-term memory, visual context and emotion, and returns a structured
    response that drives the UI, TTS and avatar.
    """

    def __init__(
        self,
        engine: Any | None = None,
        conv_manager: Any | None = None,
        ctx_store: Any | None = None,
        mem_store: Any | None = None,
        emotions: Any | None = None,
    ) -> None:
        self.engine = engine
        self.conversation = conv_manager or conversation_manager
        self.visual_context_store = ctx_store or visual_context_store
        self.memory = mem_store if mem_store is not None else default_memory_store
        self.emotions = emotions if emotions is not None else default_emotion_engine

    async def respond(
        self,
        user_text: str,
    ) -> dict[str, Any]:
        text = user_text.strip() if user_text else ""

        if not text:
            return {
                "success": False,
                "error": "empty_user_text",
                "response": {
                    "text": "",
                    "emotion": "neutral",
                    "should_speak": False,
                },
            }

        visual_context = self.visual_context_store.get_context()
        history = self.conversation.get_history()

        short_term = self._get_short_term_memory()
        long_term = self._get_long_term_memory(text)
        current_emotion = self._get_current_emotion()

        engine = self._get_engine()
        result = await engine.generate_response(
            user_text=text,
            conversation_history=history,
            visual_context=visual_context,
            memory=short_term + long_term,
            emotion=current_emotion,
        )

        response_text = str(result.get("text") or "").strip()
        emotion = self._update_emotion(result.get("emotion"))

        if response_text:
            self.conversation.add_message("user", text)
            self.conversation.add_message("assistant", response_text)
            self._remember("user", text)
            self._remember("assistant", response_text)
            self._store_durable_facts(text)

        return {
            "success": True,
            "response": {
                "text": response_text,
                "emotion": emotion,
                "should_speak": bool(result.get("should_speak", True)),
            },
            "memory": {
                "short_term": len(short_term),
                "long_term": len(long_term),
            },
        }

    def get_context_snapshot(self) -> dict[str, Any]:
        visual_context = self.visual_context_store.get_context()

        return {
            "conversation": self.conversation.get_history(),
            "visual_context": visual_context,
            "recent_visual_changes": visual_context.get("recent_changes", []),
            "memory": self._get_short_term_memory(
                settings.get_short_term_memory_limit()
            ),
            "long_term_memory": self.memory.search_long_term(
                "",
                limit=settings.get_long_term_memory_limit(),
            ),
            "emotion": self._get_current_emotion(),
        }

    def reset_session(self) -> dict[str, Any]:
        """Reset the live conversation without deleting permanent memories."""

        self.conversation.clear()
        self.memory.clear_short_term()
        self.emotions.reset()

        return {
            "success": True,
            "conversation_cleared": True,
            "short_term_cleared": True,
            "long_term_preserved": len(
                self.memory.search_long_term(
                    "",
                    limit=settings.get_long_term_memory_limit(),
                )
            ),
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _get_short_term_memory(self, limit: int | None = None) -> list[dict[str, Any]]:
        limit = limit or settings.get_short_term_memory_limit()

        try:
            entries = self.memory.get_short_term(limit)
        except AttributeError:
            return []

        return [
            {
                "role": entry.get("role", "user"),
                "content": entry.get("content", ""),
            }
            for entry in entries
            if entry.get("content")
        ]

    def _get_long_term_memory(self, text: str) -> list[dict[str, Any]]:
        try:
            return self.memory.relevant_long_term(
                text,
                limit=settings.get_long_term_memory_limit(),
            )
        except AttributeError:
            return []

    def _remember(self, role: str, content: str) -> None:
        try:
            self.memory.save_short_term(role, content)
        except AttributeError:
            return

    def _store_durable_facts(self, user_text: str) -> None:
        for fact in extract_long_term_facts(user_text):
            self.memory.save_long_term(
                key=fact["key"],
                value=fact["value"],
                category=fact["category"],
                confidence=fact["confidence"],
            )

    def _get_current_emotion(self) -> str:
        try:
            return self.emotions.get_current_emotion()
        except AttributeError:
            return "neutral"

    def _update_emotion(self, suggested: Any) -> str:
        try:
            return self.emotions.update_emotion(
                suggested_emotion=str(suggested or "neutral")
            )
        except AttributeError:
            return "neutral"

    def _get_engine(self) -> Any:
        if self.engine is None:
            self.engine = GeminiBrainEngine()

        return self.engine


airi_brain = AiriBrain()
