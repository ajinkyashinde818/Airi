from typing import Any

from voice.providers.gemini_stt import GeminiSttEngine


class SttService:

    def __init__(
        self,
        engine: Any | None = None,
    ) -> None:
        self.engine = engine

    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:

        if not audio_data:
            return {
                "success": False,
                "text": "",
                "error": "empty_audio",
            }

        result = await self._get_engine().transcribe(
            audio_data,
            sample_rate=sample_rate,
            language=language,
        )

        return result

    def _get_engine(self) -> Any:
        if self.engine is None:
            self.engine = GeminiSttEngine()

        return self.engine


stt_service = SttService()
