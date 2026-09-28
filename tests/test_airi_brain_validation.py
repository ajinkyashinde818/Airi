import asyncio
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))
os.environ.setdefault("GEMINI_API_KEY", "test-key")

from brain.airi_brain import AiriBrain  # noqa: E402
from brain.conversation_manager import ConversationManager  # noqa: E402
from vision.visual_context import VisualContextStore  # noqa: E402


class FakeBrainEngine:
    def __init__(self, responses: list[dict]) -> None:
        self.responses = responses
        self.recorded_calls: list[dict] = []

    async def generate_response(
        self,
        user_text: str,
        conversation_history: list[dict],
        visual_context: dict,
        memory: list[dict] | None = None,
        emotion: str = "neutral",
    ) -> dict:
        self.recorded_calls.append(
            {
                "user_text": user_text,
                "history": conversation_history,
                "visual_context": visual_context,
            }
        )
        return self.responses.pop(0)


class AiriBrainValidationTest(unittest.TestCase):

    def setUp(self) -> None:
        self.store = VisualContextStore(change_ttl_seconds=300)
        self.store.update(
            {
                "scene": {"description": "Indoor room", "environment": "indoor"},
                "people": [{"count": 1, "position": "center", "visible": True}],
                "objects": ["phone"],
                "activities": ["sitting"],
                "confidence": 0.9,
                "timestamp": "2026-08-10T00:00:00+00:00",
            }
        )

    def test_greeting_and_history_accumulation(self) -> None:
        fake_engine = FakeBrainEngine(
            [
                {"text": "Hey! What's up?", "emotion": "friendly", "should_speak": True},
                {"text": "Looks like your phone.", "emotion": "curious", "should_speak": True},
            ]
        )
        conv = ConversationManager(max_turns=20)
        brain = AiriBrain(engine=fake_engine, conv_manager=conv, ctx_store=self.store)

        # First turn: Greeting
        res1 = asyncio.run(brain.respond("Hello Airi"))
        self.assertTrue(res1["success"])
        self.assertEqual(res1["response"]["text"], "Hey! What's up?")
        self.assertEqual(len(conv.get_history()), 2)

        # Second turn: Visual question
        res2 = asyncio.run(brain.respond("What am I holding?"))
        self.assertTrue(res2["success"])
        self.assertEqual(res2["response"]["text"], "Looks like your phone.")
        self.assertEqual(len(conv.get_history()), 4)

        # Verify recorded call received visual context directly
        last_call = fake_engine.recorded_calls[-1]
        self.assertEqual(last_call["user_text"], "What am I holding?")
        self.assertEqual(last_call["visual_context"]["objects"], ["phone"])

    def test_empty_user_text_rejection(self) -> None:
        brain = AiriBrain(engine=FakeBrainEngine([]), conv_manager=ConversationManager(), ctx_store=self.store)
        res = asyncio.run(brain.respond("   "))

        self.assertFalse(res["success"])
        self.assertEqual(res["error"], "empty_user_text")

    def test_conversation_history_truncation(self) -> None:
        conv = ConversationManager(max_turns=4)
        conv.add_message("user", "1")
        conv.add_message("assistant", "2")
        conv.add_message("user", "3")
        conv.add_message("assistant", "4")
        conv.add_message("user", "5")

        history = conv.get_history()
        self.assertEqual(len(history), 4)
        self.assertEqual(history[0]["content"], "2")
        self.assertEqual(history[-1]["content"], "5")


if __name__ == "__main__":
    unittest.main()
