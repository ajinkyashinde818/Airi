from datetime import datetime
from typing import Any

from vision.vision_engine import VisionEngine


class DevelopmentVisionEngine(VisionEngine):

    async def analyze(
        self,
        image_data: bytes
    ) -> dict[str, Any]:

        return {
            "success": True,
            "scene": "unknown",
            "people": [],
            "objects": [],
            "activities": [],
            "confidence": 0.0,
            "timestamp": datetime.utcnow().isoformat(),
        }