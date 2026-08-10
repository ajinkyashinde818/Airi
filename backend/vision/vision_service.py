from typing import Any

from vision.providers.gemini_vision import (
    GeminiVisionEngine,
)
from vision.visual_context import visual_context_store


class VisionService:

    def __init__(self) -> None:

        self.engine = GeminiVisionEngine()
        self.context_store = visual_context_store

    async def analyze(
        self,
        image_data: bytes
    ) -> dict[str, Any]:

        if not image_data:
            raise ValueError(
                "Empty image received."
            )

        result = await self.engine.analyze(
            image_data
        )

        if result.get("success") is True:
            result["visual_context"] = (
                self.context_store.update(result)
            )

        return result

    def get_context(
        self
    ) -> dict[str, Any]:

        return self.context_store.get_context()


vision_service = VisionService()
