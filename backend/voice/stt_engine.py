from abc import ABC, abstractmethod
from typing import Any


class SttEngine(ABC):
    """
    Base interface for all Airi Speech-to-Text engines.
    """

    @abstractmethod
    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:
        """
        Transcribe audio data bytes and return structured transcript info.
        """
        raise NotImplementedError
