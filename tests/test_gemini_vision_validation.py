import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))

from vision.providers.gemini_vision import (  # noqa: E402
    GeminiVisionEngine,
    VisionValidationError,
)


class GeminiVisionValidationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = GeminiVisionEngine.__new__(
            GeminiVisionEngine
        )

    def test_valid_structured_json_is_normalized(self) -> None:
        payload = self.engine._parse_response(
            """
            {
              "scene": {
                "description": " Indoor room ",
                "environment": "indoor"
              },
              "people": [
                {
                  "count": 1,
                  "position": " center ",
                  "visible": true
                }
              ],
              "objects": ["phone", " phone ", "", null, 3],
              "activities": ["sitting"],
              "changes": ["phone appeared"],
              "confidence": 0.91
            }
            """
        )

        self.assertEqual(
            payload["scene"]["description"],
            "Indoor room",
        )
        self.assertEqual(
            payload["people"],
            [
                {
                    "count": 1,
                    "position": "center",
                    "visible": True,
                }
            ],
        )
        self.assertEqual(payload["objects"], ["phone"])
        self.assertEqual(payload["confidence"], 0.91)

    def test_json_inside_markdown_code_fence(self) -> None:
        payload = self.engine._parse_response(
            """```json
            {"objects":["chair"],"confidence":0.5}
            ```"""
        )

        self.assertEqual(payload["objects"], ["chair"])
        self.assertEqual(payload["confidence"], 0.5)

    def test_json_surrounded_by_short_text(self) -> None:
        payload = self.engine._parse_response(
            'Here is the scene: {"objects":["book"],"confidence":0.7}'
        )

        self.assertEqual(payload["objects"], ["book"])

    def test_missing_optional_fields_and_confidence(self) -> None:
        payload = self.engine._parse_response(
            '{"objects":["phone"]}'
        )

        self.assertEqual(
            payload["scene"],
            {
                "description": None,
                "environment": None,
            },
        )
        self.assertEqual(payload["people"], [])
        self.assertEqual(payload["confidence"], 0.0)

    def test_people_integer_is_canonicalized(self) -> None:
        payload = self.engine._parse_response(
            '{"people":2,"confidence":91}'
        )

        self.assertEqual(
            payload["people"],
            [
                {
                    "count": 2,
                    "position": None,
                    "visible": True,
                }
            ],
        )
        self.assertEqual(payload["confidence"], 0.91)

    def test_invalid_people_shape_is_empty_list(self) -> None:
        payload = self.engine._parse_response(
            '{"people":"two","objects":["phone"]}'
        )

        self.assertEqual(payload["people"], [])

    def test_malformed_json_is_rejected(self) -> None:
        with self.assertRaises(VisionValidationError):
            self.engine._parse_response("{broken json")

    def test_empty_response_is_rejected(self) -> None:
        with self.assertRaises(VisionValidationError):
            self.engine._parse_response("")

    def test_unexpected_response_is_rejected(self) -> None:
        with self.assertRaises(VisionValidationError):
            self.engine._parse_response('{"unrelated":"value"}')


if __name__ == "__main__":
    unittest.main()
