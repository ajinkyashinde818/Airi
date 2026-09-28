from typing import Any

from ai.gemini_runtime import generate_content
from config import settings
from voice.stt_engine import SttEngine


class GeminiSttEngine(SttEngine):

    def __init__(self) -> None:
        if not settings.is_api_key_configured():
            raise RuntimeError(
                "GEMINI_API_KEY is not configured."
            )

        self.model = settings.get_stt_model()

    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:

        if not audio_data or len(audio_data) < 44:
            return {
                "success": False,
                "text": "",
                "model": self.model,
                "error": "empty_or_invalid_audio",
            }

        from google.genai import types

        prompt = (
            "Transcribe the audio speech accurately. "
            "Return ONLY the verbatim spoken text transcript. "
            "Supports English, Indian English, Hindi, and mixed Hindi-English (Hinglish). "
            "Do not add any conversational responses, notes, or descriptions. "
            "If there is no clear spoken speech in the audio, return empty string."
        )

        try:
            response, model_used = await generate_content(
                model_env_var="AIRI_STT_MODEL",
                default_model=settings.get_stt_model(),
                contents=[
                    types.Part.from_bytes(
                        data=audio_data,
                        mime_type="audio/wav",
                    ),
                    prompt,
                ],
            )

            raw_text = (response.text or "").strip()

            # Clean potential code block or quotes wrap
            if raw_text.startswith('"') and raw_text.endswith('"') and len(raw_text) > 1:
                raw_text = raw_text[1:-1].strip()

            if not raw_text or raw_text.lower() in {"[silence]", "[no speech]", "no speech", "null"}:
                return {
                    "success": True,
                    "text": "",
                    "language": language or "en",
                    "model": model_used,
                }

            return {
                "success": True,
                "text": raw_text,
                "language": language or "en",
                "model": model_used,
            }

        except Exception as error:
            print("Airi STT: Gemini transcription error:", repr(error))
            return {
                "success": False,
                "text": "",
                "model": self.model,
                "error": str(error),
            }
