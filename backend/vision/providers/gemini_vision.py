import json
from typing import Any

from ai.gemini_runtime import generate_content
from config import settings
from vision.vision_engine import VisionEngine


class VisionValidationError(ValueError):
    pass


class GeminiVisionEngine(VisionEngine):

    def __init__(self) -> None:

        if not settings.is_api_key_configured():
            raise RuntimeError(
                "GEMINI_API_KEY is not configured."
            )

        self.model = settings.get_vision_model()

    async def analyze(
        self,
        image_data: bytes
    ) -> dict[str, Any]:

        if not image_data:
            raise ValueError(
                "Empty image received."
            )

        from google.genai import types

        response, model_used = await generate_content(
            model_env_var="AIRI_VISION_MODEL",
            default_model=settings.get_vision_model(),

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

        try:
            payload = self._parse_response(
                response.text or ""
            )
        except VisionValidationError as error:
            print(
                "Airi Vision: structured response validation failed:",
                str(error),
            )

            return {
                "success": False,
                "description": "",
                "model": model_used,
                "error": "structured_validation_failed",
            }

        description = self._build_description(
            payload
        )

        return {
            "success": True,
            "description": description,
            "model": model_used,
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
        json_text = self._extract_json_object(text)

        try:
            value = json.loads(json_text)
        except json.JSONDecodeError as error:
            raise VisionValidationError(
                "Malformed JSON response."
            ) from error

        if not isinstance(value, dict):
            raise VisionValidationError(
                "Vision response must be a JSON object."
            )

        return self._validate_payload(value)

    def _extract_json_object(
        self,
        text: str,
    ) -> str:
        cleaned = text.strip()

        if not cleaned:
            raise VisionValidationError(
                "Empty vision response."
            )

        if cleaned.startswith("```"):
            lines = cleaned.splitlines()

            if lines and lines[0].strip().startswith("```"):
                lines = lines[1:]

            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]

            cleaned = "\n".join(lines).strip()

        start = cleaned.find("{")

        if start < 0:
            raise VisionValidationError(
                "Vision response did not contain JSON."
            )

        depth = 0
        in_string = False
        escaped = False

        for index in range(start, len(cleaned)):
            character = cleaned[index]

            if in_string:
                if escaped:
                    escaped = False
                elif character == "\\":
                    escaped = True
                elif character == '"':
                    in_string = False

                continue

            if character == '"':
                in_string = True
            elif character == "{":
                depth += 1
            elif character == "}":
                depth -= 1

                if depth == 0:
                    return cleaned[start:index + 1]

        raise VisionValidationError(
            "Vision response JSON object was incomplete."
        )

    def _validate_payload(
        self,
        value: dict[str, Any],
    ) -> dict[str, Any]:
        known_keys = {
            "scene",
            "people",
            "objects",
            "activities",
            "activity",
            "changes",
            "confidence",
        }

        if not known_keys.intersection(value):
            raise VisionValidationError(
                "Vision response did not include recognized fields."
            )

        return {
            "scene": self._normalize_scene(
                value.get("scene")
            ),
            "people": self._normalize_people(
                value.get("people")
            ),
            "objects": self._normalize_string_list(
                value.get("objects")
            ),
            "activities": self._normalize_string_list(
                value.get("activities")
                if "activities" in value
                else value.get("activity")
            ),
            "changes": self._normalize_string_list(
                value.get("changes")
            ),
            "confidence": self._normalize_confidence(
                value.get("confidence")
            ),
        }

    def _normalize_scene(
        self,
        value: Any,
    ) -> dict[str, str | None]:
        if value is None:
            return {
                "description": None,
                "environment": None,
            }

        if not isinstance(value, dict):
            raise VisionValidationError(
                "scene must be an object or null."
            )

        return {
            "description": self._normalize_optional_string(
                value.get("description")
            ),
            "environment": self._normalize_optional_string(
                value.get("environment")
            ),
        }

    def _normalize_people(
        self,
        value: Any,
    ) -> list[dict[str, Any]]:
        if value is None:
            return []

        if isinstance(value, int) and not isinstance(value, bool):
            if value <= 0:
                return []

            return [
                {
                    "count": value,
                    "position": None,
                    "visible": True,
                }
            ]

        if not isinstance(value, list):
            return []

        people: list[dict[str, Any]] = []

        for item in value:
            if not isinstance(item, dict):
                continue

            count = self._normalize_count(
                item.get("count")
            )
            visible = self._normalize_bool(
                item.get("visible")
            )

            people.append(
                {
                    "count": count,
                    "position": self._normalize_optional_string(
                        item.get("position")
                    ),
                    "visible": visible,
                }
            )

        return people

    def _normalize_string_list(
        self,
        value: Any,
    ) -> list[str]:
        if value is None:
            return []

        if not isinstance(value, list):
            return []

        normalized: list[str] = []
        seen: set[str] = set()

        for item in value:
            text = self._normalize_optional_string(item)

            if text is None:
                continue

            key = text.lower()

            if key in seen:
                continue

            normalized.append(text)
            seen.add(key)

        return normalized

    def _normalize_confidence(
        self,
        value: Any,
    ) -> float:
        if value is None:
            return 0.0

        if isinstance(value, bool):
            return 0.0

        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return 0.0

        if confidence > 1.0 and confidence <= 100.0:
            confidence = confidence / 100.0

        return max(0.0, min(confidence, 1.0))

    def _normalize_count(
        self,
        value: Any,
    ) -> int | None:
        if value is None or isinstance(value, bool):
            return None

        try:
            count = int(value)
        except (TypeError, ValueError):
            return None

        return max(0, count)

    def _normalize_bool(
        self,
        value: Any,
    ) -> bool | None:
        if isinstance(value, bool):
            return value

        return None

    def _normalize_optional_string(
        self,
        value: Any,
    ) -> str | None:
        if value is None:
            return None

        if not isinstance(value, str):
            return None

        cleaned = value.strip()

        return cleaned or None

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
