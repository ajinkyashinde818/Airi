import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))

from vision.visual_context import VisualContextStore


class VisualContextStoreTest(unittest.TestCase):
    def test_updates_context_and_detects_recent_changes(self) -> None:
        store = VisualContextStore(change_ttl_seconds=300)

        first = store.update(
            {
                "scene": {
                    "description": "A room",
                    "environment": "indoor",
                },
                "people": [
                    {
                        "count": 1,
                        "position": "center",
                        "visible": True,
                    }
                ],
                "objects": ["chair"],
                "activities": ["sitting"],
                "confidence": 0.9,
                "timestamp": "2026-08-10T00:00:00+00:00",
            }
        )

        self.assertEqual(first["recent_changes"], [])

        second = store.update(
            {
                "scene": {
                    "description": "A room",
                    "environment": "indoor",
                },
                "people": [
                    {
                        "count": 2,
                        "position": "center",
                        "visible": True,
                    }
                ],
                "objects": ["chair", "phone"],
                "activities": ["talking"],
                "confidence": 0.8,
                "timestamp": "2026-08-10T00:00:05+00:00",
            }
        )

        self.assertIn(
            "another person appeared",
            second["recent_changes"],
        )
        self.assertIn(
            "phone appeared",
            second["recent_changes"],
        )
        self.assertEqual(second["confidence"], 0.8)

    def test_normalizes_untrusted_provider_fields(self) -> None:
        store = VisualContextStore(change_ttl_seconds=300)

        context = store.update(
            {
                "scene": "not a scene",
                "description": "Visible scene",
                "people": [{"count": "1", "visible": "yes"}],
                "objects": [" phone ", "phone", None],
                "activities": "sitting",
                "confidence": 4,
            }
        )

        self.assertEqual(
            context["scene"]["description"],
            "Visible scene",
        )
        self.assertEqual(context["objects"], ["phone"])
        self.assertEqual(context["activities"], [])
        self.assertEqual(context["confidence"], 1.0)


if __name__ == "__main__":
    unittest.main()
