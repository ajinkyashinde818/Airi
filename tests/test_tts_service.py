import pytest
from voice.tts_service import tts_service


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_tts_service_generation():
    result = await tts_service.generate_speech("Hello Airi!")
    assert result["success"] is True
    assert result["text"] == "Hello Airi!"
    assert result["audio_base64"] is not None
