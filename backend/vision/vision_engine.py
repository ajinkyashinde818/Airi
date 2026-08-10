from abc import ABC, abstractmethod
from typing import Any


class VisionEngine(ABC):
    """
    Base interface for all Airi vision engines.
    """

    @abstractmethod
    async def analyze(
        self,
        image_data: bytes
    ) -> dict[str, Any]:
        """
        Analyze an image and return structured
        visual information.
        """
        raise NotImplementedError