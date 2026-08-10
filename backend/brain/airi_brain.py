from typing import Any

from vision.visual_context import visual_context_store


class AiriBrain:
    def get_context_snapshot(
        self
    ) -> dict[str, Any]:
        visual_context = visual_context_store.get_context()

        return {
            "conversation": [],
            "visual_context": visual_context,
            "recent_visual_changes": (
                visual_context.get("recent_changes", [])
            ),
            "memory": [],
            "emotion": "neutral",
        }


airi_brain = AiriBrain()
