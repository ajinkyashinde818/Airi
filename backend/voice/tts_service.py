import base64
import math
import struct
from typing import Any

from ai.gemini_runtime import generate_speech_bytes
from brain.emotion_engine import normalize_emotion
from config import settings


class TtsService:
    """Backend text-to-speech used as the fallback voice for Airi.

    The React client uses the browser SpeechSynthesis API as its primary
    voice (instant, offline, no network round trip). This service provides a
    server-rendered voice for browsers without SpeechSynthesis support and
    for API/automation consumers of the Airi backend.
    """

    def __init__(self) -> None:
        self.default_voice = settings.get_tts_voice()

    async def generate_speech(
        self, text: str, voice: str | None = None, emotion: str = "neutral"
    ) -> dict[str, Any]:
        cleaned = text.strip() if text else ""
        if not cleaned:
            return {
                "success": False,
                "error": "empty_text",
                "audio_base64": None,
                "text": "",
                "source": "none",
            }

        emotion = normalize_emotion(emotion)
        resolved_voice = voice or self.default_voice

        if settings.is_api_key_configured():
            try:
                audio_bytes, mime_type, model_used = generate_speech_bytes(
                    text=self._styled_text(cleaned, emotion),
                    voice=resolved_voice,
                    model_env_var="AIRI_TTS_MODEL",
                    default_model=settings.get_tts_model(),
                )

                return {
                    "success": True,
                    "text": cleaned,
                    "voice": resolved_voice,
                    "emotion": emotion,
                    "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "source": "gemini",
                    "model": model_used,
                }
            except Exception as error:  # noqa: BLE001 - fall back gracefully
                print("Airi TTS: Gemini synthesis failed, using fallback:", repr(error))

        wav_bytes = self._generate_synthetic_wav(cleaned)

        return {
            "success": True,
            "text": cleaned,
            "voice": resolved_voice,
            "emotion": emotion,
            "audio_base64": base64.b64encode(wav_bytes).decode("utf-8"),
            "mime_type": "audio/wav",
            "source": "fallback",
            "warning": "Gemini TTS unavailable; returned placeholder audio.",
        }

    def _styled_text(self, text: str, emotion: str) -> str:
        """Add a light spoken-style hint so Gemini TTS performs the emotion."""

        if emotion == "neutral":
            return text

        return f"Say this in a {emotion} tone: {text}"

    def _generate_synthetic_wav(self, text: str, sample_rate: int = 22050) -> bytes:
        # Simple procedural sound for server-rendered audio fallback
        duration_sec = max(0.5, min(len(text) * 0.05, 3.0))
        num_samples = int(sample_rate * duration_sec)
        samples = bytearray()

        frequency = 440.0
        for i in range(num_samples):
            t = float(i) / sample_rate
            value = int(32767.0 * 0.3 * math.sin(2.0 * math.pi * frequency * t))
            samples.extend(struct.pack("<h", value))

        header = bytearray()
        # RIFF header
        header.extend(b"RIFF")
        header.extend(struct.pack("<I", 36 + len(samples)))
        header.extend(b"WAVE")
        # fmt subchunk
        header.extend(b"fmt ")
        header.extend(struct.pack("<I", 16))  # Subchunk1Size (16 for PCM)
        header.extend(struct.pack("<H", 1))   # AudioFormat (1 for PCM)
        header.extend(struct.pack("<H", 1))   # NumChannels (1 mono)
        header.extend(struct.pack("<I", sample_rate)) # SampleRate
        header.extend(struct.pack("<I", sample_rate * 2)) # ByteRate
        header.extend(struct.pack("<H", 2))   # BlockAlign
        header.extend(struct.pack("<H", 16))  # BitsPerSample
        # data subchunk
        header.extend(b"data")
        header.extend(struct.pack("<I", len(samples)))

        return bytes(header + samples)


tts_service = TtsService()
