from brain.emotion_engine import EmotionEngine


def test_emotion_engine_updates():
    engine = EmotionEngine("neutral")
    assert engine.get_current_emotion() == "neutral"

    updated = engine.update_emotion(suggested_emotion="happy")
    assert updated == "happy"
    assert engine.get_current_emotion() == "happy"

    updated_sentiment = engine.update_emotion(text_sentiment="That's awesome!")
    assert updated_sentiment == "happy"
