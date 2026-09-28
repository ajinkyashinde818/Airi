from typing import Any

from vision.providers.gemini_vision import (
    GeminiVisionEngine,
)
from vision.visual_context import visual_context_store


class VisionService:

    def __init__(
        self,
        engine: Any | None = None,
        context_store: Any | None = None,
    ) -> None:

        self.engine = engine
        self.context_store = context_store or visual_context_store

    async def analyze(
        self,
        image_data: bytes
    ) -> dict[str, Any]:

        if not image_data:
            raise ValueError(
                "Empty image received."
            )

        result = await self._get_engine().analyze(
            image_data
        )

        if result.get("success") is True:
            result["visual_context"] = (
                self.context_store.update(result)
            )
        else:
            result["visual_context"] = (
                self.context_store.get_context()
            )

        return result

    def get_context(
        self
    ) -> dict[str, Any]:

        return self.context_store.get_context()

    def _get_engine(
        self
    ) -> Any:

        if self.engine is None:
            self.engine = GeminiVisionEngine()

        return self.engine


vision_service = VisionService()
