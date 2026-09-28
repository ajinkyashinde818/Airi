from typing import Any

VALID_EMOTIONS = {
    "neutral",
    "happy",
    "sad",
    "excited",
    "curious",
    "confused",
    "concerned",
    "calm",
    "surprised",
    "thinking",
}

# Model output sometimes uses richer words than the avatar supports.
EMOTION_ALIASES = {
    "friendly": "happy",
    "joyful": "happy",
    "cheerful": "happy",
    "playful": "happy",
    "amused": "happy",
    "thoughtful": "thinking",
    "thinking": "thinking",
    "pensive": "thinking",
    "interested": "curious",
    "inquisitive": "curious",
    "worried": "concerned",
    "anxious": "concerned",
    "empathetic": "concerned",
    "sorry": "sad",
    "upset": "sad",
    "angry": "concerned",
    "amazed": "surprised",
    "shocked": "surprised",
    "relaxed": "calm",
    "serene": "calm",
    "peaceful": "calm",
}


def normalize_emotion(emotion: str | None) -> str:
    """Map any model/UI emotion value onto a supported Airi emotion."""

    if not emotion:
        return "neutral"

    candidate = emotion.strip().lower()

    if candidate in VALID_EMOTIONS:
        return candidate

    if candidate in EMOTION_ALIASES:
        return EMOTION_ALIASES[candidate]

    return "neutral"


class EmotionEngine:
    def __init__(self, initial_emotion: str = "neutral") -> None:
        self._current_emotion = normalize_emotion(initial_emotion)
        self._intensity = 0.5

    def get_current_emotion(self) -> str:
        return self._current_emotion

    def update_emotion(
        self,
        suggested_emotion: str | None = None,
        text_sentiment: str | None = None,
    ) -> str:
        if suggested_emotion:
            normalized = normalize_emotion(suggested_emotion)

            if normalized != "neutral" or suggested_emotion.strip().lower() == "neutral":
                self._current_emotion = normalized
                return self._current_emotion

        if text_sentiment:
            s = text_sentiment.lower()
            if any(word in s for word in ["great", "awesome", "happy", "love", "haha", "yay", "wonderful"]):
                self._current_emotion = "happy"
            elif any(word in s for word in ["wow", "really?", "amazing", "unbelievable"]):
                self._current_emotion = "surprised"
            elif any(word in s for word in ["why", "how", "what if", "explain", "curious"]):
                self._current_emotion = "curious"
            elif any(word in s for word in ["sad", "sorry", "bad", "unfortunate", "upset"]):
                self._current_emotion = "sad"
            elif any(word in s for word in ["confused", "huh", "don't understand", "puzzled"]):
                self._current_emotion = "confused"

        return self._current_emotion

    def reset(self) -> None:
        self._current_emotion = "neutral"

    def snapshot(self) -> dict[str, Any]:
        return {
            "emotion": self._current_emotion,
            "intensity": self._intensity,
        }


emotion_engine = EmotionEngine()

