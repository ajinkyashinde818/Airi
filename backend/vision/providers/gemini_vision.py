import json
import os
import re
from typing import Any

from google import genai
from google.genai import types

from vision.vision_engine import VisionEngine


class GeminiVisionEngine(VisionEngine):

    def __init__(self) -> None:

        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not configured."
            )

        self.client = genai.Client(
            api_key=api_key
        )

        self.model = os.getenv(
            "AIRI_VISION_MODEL",
            "gemini-2.5-flash-lite"
        )

    async def analyze(
        self,
        image_data: bytes
    ) -> dict[str, Any]:

        if not image_data:
            raise ValueError(
                "Empty image received."
            )

        response = await self.client.aio.models.generate_content(
            model=self.model,

            contents=[
                types.Part.from_bytes(
                    data=image_data,
                    mime_type="image/jpeg",
                ),

                (
                    "Analyze this camera frame for Airi. "
                    "Return only valid JSON with this shape: "
                    "{"
                    "\"scene\":{\"description\":string|null,"
                    "\"environment\":string|null},"
                    "\"people\":[{\"count\":number|null,"
                    "\"position\":string|null,\"visible\":boolean|null}],"
                    "\"objects\":[string],"
                    "\"activities\":[string],"
                    "\"changes\":[string],"
                    "\"confidence\":number|null"
                    "}. "
                    "Only report information that is actually visible. "
                    "Use null or an empty array when a field cannot be "
                    "reliably determined. Do not invent details."
                ),
            ],

            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )

        payload = self._parse_response(
            response.text or ""
        )
        description = self._build_description(
            payload
        )

        return {
            "success": True,
            "description": description,
            "model": self.model,
            "scene": payload.get("scene") or {},
            "people": payload.get("people") or [],
            "objects": payload.get("objects") or [],
            "activities": payload.get("activities") or [],
            "changes": payload.get("changes") or [],
            "confidence": payload.get("confidence"),
        }

    def _parse_response(
        self,
        text: str,
    ) -> dict[str, Any]:
        cleaned = text.strip()

        if not cleaned:
            return {}

        if cleaned.startswith("```"):
            cleaned = re.sub(
                r"^```(?:json)?\s*|\s*```$",
                "",
                cleaned,
                flags=re.IGNORECASE,
            ).strip()

        try:
            value = json.loads(cleaned)
        except json.JSONDecodeError:
            return {
                "scene": {
                    "description": cleaned,
                    "environment": None,
                },
                "people": [],
                "objects": [],
                "activities": [],
                "changes": [],
                "confidence": None,
            }

        if not isinstance(value, dict):
            return {}

        return value

    def _build_description(
        self,
        payload: dict[str, Any],
    ) -> str:
        scene = payload.get("scene")

        if isinstance(scene, dict):
            description = scene.get("description")

            if isinstance(description, str):
                return description

        return ""
