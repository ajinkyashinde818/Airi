import asyncio
import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from vision.vision_service import VisionService  # noqa: E402
from vision.visual_context import VisualContextStore  # noqa: E402


class FakeVisionEngine:
    def __init__(
        self,
        results: list[dict],
    ) -> None:
        self.results = results

    async def analyze(
        self,
        image_data: bytes,
    ) -> dict:
        return self.results.pop(0)


class VisionServiceValidationTest(unittest.TestCase):
    def test_failed_analysis_preserves_previous_valid_context(self) -> None:
        store = VisualContextStore(change_ttl_seconds=300)
        valid_result = {
            "success": True,
            "description": "Indoor room",
            "scene": {
                "description": "Indoor room",
                "environment": "indoor",
            },
            "people": [
                {
                    "count": 1,
                    "position": "center",
                    "visible": True,
                }
            ],
            "objects": ["phone"],
            "activities": ["sitting"],
            "changes": [],
            "confidence": 0.92,
            "timestamp": "2026-08-10T00:00:00+00:00",
        }
        failed_result = {
            "success": False,
            "description": "",
            "error": "structured_validation_failed",
        }
        later_valid_result = {
            "success": True,
            "description": "Indoor room",
            "scene": {
                "description": "Indoor room",
                "environment": "indoor",
            },
            "people": [
                {
                    "count": 1,
                    "position": "center",
                    "visible": True,
                }
            ],
            "objects": ["phone", "book"],
            "activities": ["sitting"],
            "changes": [],
            "confidence": 0.8,
            "timestamp": "2026-08-10T00:00:10+00:00",
        }
        service = VisionService(
            engine=FakeVisionEngine(
                [
                    valid_result,
                    failed_result,
                    later_valid_result,
                ]
            ),
            context_store=store,
        )

        asyncio.run(service.analyze(b"frame"))
        previous_context = service.get_context()

        failed_response = asyncio.run(
            service.analyze(b"frame")
        )
        failed_context = service.get_context()

        self.assertFalse(failed_response["success"])
        self.assertEqual(failed_context, previous_context)

        later_response = asyncio.run(
            service.analyze(b"frame")
        )
        later_context = service.get_context()

        self.assertTrue(later_response["success"])
        self.assertNotEqual(later_context, previous_context)
        self.assertEqual(
            later_context["objects"],
            ["phone", "book"],
        )
        self.assertIn(
            "book appeared",
            later_context["recent_changes"],
        )


if __name__ == "__main__":
    unittest.main()
