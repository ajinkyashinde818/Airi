import json
from typing import Any

from ai.gemini_runtime import generate_content
from brain.brain_engine import BrainEngine
from brain.emotion_engine import normalize_emotion
from brain.personality import AIRI_SYSTEM_PROMPT
from config import settings


class GeminiBrainEngine(BrainEngine):

    def __init__(self) -> None:
        if not settings.is_api_key_configured():
            raise RuntimeError(
                "GEMINI_API_KEY is not configured."
            )

        self.model = settings.get_brain_model()

    async def generate_response(
        self,
        user_text: str,
        conversation_history: list[dict[str, Any]],
        visual_context: dict[str, Any],
        memory: list[dict[str, Any]] | None = None,
        emotion: str = "neutral",
    ) -> dict[str, Any]:

        if not user_text or not user_text.strip():
            return {
                "text": "",
                "emotion": "neutral",
                "should_speak": False,
            }

        from google.genai import types

        context_prompt = self._build_context_prompt(
            user_text=user_text.strip(),
            conversation_history=conversation_history,
            visual_context=visual_context,
            memory=memory or [],
            emotion=emotion,
        )

        try:
            response, _model_used = await generate_content(
                model_env_var="AIRI_BRAIN_MODEL",
                default_model=settings.get_brain_model(),
                contents=[
                    AIRI_SYSTEM_PROMPT,
                    context_prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.7,
                ),
            )

            raw_text = response.text or ""
            parsed = self._parse_json_response(raw_text)

            return {
                "text": str(parsed.get("text", "") or "").strip(),
                "emotion": normalize_emotion(
                    str(parsed.get("emotion", "") or "")
                ),
                "should_speak": bool(parsed.get("should_speak", True)),
            }

        except Exception as error:
            print("Airi Brain: Gemini generation error:", repr(error))

            return {
                "text": (
                    "Sorry, I had a little trouble thinking that through. "
                    "Try again."
                ),
                "emotion": "neutral",
                "should_speak": True,
                "error": type(error).__name__,
            }

    def _build_context_prompt(
        self,
        user_text: str,
        conversation_history: list[dict[str, Any]],
        visual_context: dict[str, Any],
        memory: list[dict[str, Any]],
        emotion: str,
    ) -> str:
        payload = {
            "current_user_message": user_text,
            "conversation_history": conversation_history,
            "current_visual_context": {
                "scene": visual_context.get("scene", {}),
                "people": visual_context.get("people", []),
                "objects": visual_context.get("objects", []),
                "activities": visual_context.get("activities", []),
                "recent_changes": visual_context.get("recent_changes", []),
                "confidence": visual_context.get("confidence"),
            },
            "memory": memory,
            "current_emotion": emotion,
        }

        return f"CURRENT INPUT DATA:\n{json.dumps(payload, indent=2)}"

    def _parse_json_response(self, text: str) -> dict[str, Any]:
        cleaned = text.strip()

        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].strip().startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            val = json.loads(cleaned)
            if isinstance(val, dict):
                return val
        except json.JSONDecodeError:
            pass

        return {
            "text": cleaned,
            "emotion": "neutral",
            "should_speak": True,
        }
