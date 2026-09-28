from abc import ABC, abstractmethod
from typing import Any


class BrainEngine(ABC):
    """
    Base interface for all Airi reasoning/brain engines.
    """

    @abstractmethod
    async def generate_response(
        self,
        user_text: str,
        conversation_history: list[dict[str, Any]],
        visual_context: dict[str, Any],
        memory: list[dict[str, Any]] | None = None,
        emotion: str = "neutral",
    ) -> dict[str, Any]:
        """
        Generate a structured Airi response based on user input,
        conversation history, and visual context.
        """
        raise NotImplementedError
