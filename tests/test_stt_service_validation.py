import asyncio
import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from voice.providers.gemini_stt import GeminiSttEngine  # noqa: E402
from voice.stt_service import SttService  # noqa: E402


class FakeSttEngine:
    def __init__(self, responses: list[dict]) -> None:
        self.responses = responses

    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int | None = None,
        language: str | None = None,
    ) -> dict:
        return self.responses.pop(0)


class SttServiceValidationTest(unittest.TestCase):

    def test_transcribe_success_flow(self) -> None:
        fake = FakeSttEngine(
            [
                {
                    "success": True,
                    "text": "Hello Airi",
                    "language": "en",
                }
            ]
        )
        service = SttService(engine=fake)

        result = asyncio.run(service.transcribe(b"fake-wav-audio-bytes"))

        self.assertTrue(result["success"])
        self.assertEqual(result["text"], "Hello Airi")

    def test_transcribe_empty_audio_rejection(self) -> None:
        service = SttService(engine=FakeSttEngine([]))

        result = asyncio.run(service.transcribe(b""))

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "empty_audio")

    def test_gemini_stt_engine_empty_bytes(self) -> None:
        engine = GeminiSttEngine.__new__(GeminiSttEngine)
        engine.model = "gemini-test"

        result = asyncio.run(engine.transcribe(b"too_short"))

        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "empty_or_invalid_audio")


if __name__ == "__main__":
    unittest.main()
