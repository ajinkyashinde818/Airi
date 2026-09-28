import sys
from pathlib import Path

# Ensure backend directory is in sys.path for internal module imports
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

# Explicitly load backend/.env
dotenv_path = backend_dir / ".env"
load_dotenv(dotenv_path=dotenv_path, override=True)
load_dotenv()  # Fallback load from CWD

from fastapi import (
    FastAPI,
    File,
    UploadFile,
    HTTPException,
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
from vision.vision_service import vision_service
from voice.stt_service import stt_service
from brain.airi_brain import airi_brain
from memory.memory_store import memory_store
from brain.emotion_engine import VALID_EMOTIONS, normalize_emotion
from voice.tts_service import tts_service


class BrainRequest(BaseModel):
    text: str = Field(min_length=1)


class TtsRequest(BaseModel):
    text: str = Field(min_length=1)
    voice: str | None = None
    emotion: str | None = None


class MemorySaveRequest(BaseModel):
    key: str = Field(min_length=1)
    value: str = Field(min_length=1)
    category: str = "fact"
    confidence: float = 1.0


class EmotionUpdateRequest(BaseModel):
    emotion: str


app = FastAPI(title="Airi API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def check_api_key_configured() -> bool:
    """True when a usable GEMINI_API_KEY is present in the environment."""

    return settings.is_api_key_configured()


@app.get("/")
async def root():
    return {
        "name": "Airi",
        "status": "online",
        "version": app.version,
        "gemini_configured": check_api_key_configured(),
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "gemini_configured": check_api_key_configured(),
        "brain_model": settings.get_brain_model(),
        "vision_model": settings.get_vision_model(),
        "stt_model": settings.get_stt_model(),
        "tts_model": settings.get_tts_model(),
    }


@app.get("/config/status")
async def config_status():
    return {
        "gemini_api_key_configured": check_api_key_configured(),
        "vision_model": settings.get_vision_model(),
        "brain_model": settings.get_brain_model(),
        "stt_model": settings.get_stt_model(),
        "tts_model": settings.get_tts_model(),
        "tts_voice": settings.get_tts_voice(),
    }


@app.post("/vision/frame")
async def receive_frame(image: UploadFile = File(...)):
    if not check_api_key_configured():
        return {
            "success": False,
            "error": "GEMINI_API_KEY is not configured",
            "scene": {},
            "people": [],
            "objects": [],
            "activities": [],
            "changes": [],
            "confidence": 0.0,
            "visual_context": vision_service.get_context(),
        }

    try:
        image_data = await image.read()
        if not image_data:
            raise HTTPException(
                status_code=400,
                detail="Empty image received.",
            )

        result = await vision_service.analyze(image_data)
        return result

    except HTTPException:
        raise
    except Exception as error:
        error_msg = str(error)
        print("Vision error:", repr(error))
        if "GEMINI_API_KEY is not configured" in error_msg:
            return {
                "success": False,
                "error": "GEMINI_API_KEY is not configured",
                "visual_context": vision_service.get_context(),
            }
        return {
            "success": False,
            "error": error_msg,
            "visual_context": vision_service.get_context(),
        }


@app.get("/vision/context")
async def get_visual_context():
    return vision_service.get_context()


@app.post("/voice/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not check_api_key_configured():
        return {
            "success": False,
            "text": "",
            "error": "GEMINI_API_KEY is not configured",
        }

    try:
        audio_data = await audio.read()
        if not audio_data:
            raise HTTPException(
                status_code=400,
                detail="Empty audio received.",
            )

        result = await stt_service.transcribe(audio_data)
        return result

    except HTTPException:
        raise
    except Exception as error:
        error_msg = str(error)
        print("STT error:", repr(error))
        if "GEMINI_API_KEY is not configured" in error_msg:
            return {
                "success": False,
                "text": "",
                "error": "GEMINI_API_KEY is not configured",
            }
        return {
            "success": False,
            "text": "",
            "error": error_msg,
        }


@app.post("/brain/respond")
async def brain_respond(payload: BrainRequest):
    if not payload.text or not payload.text.strip():
        raise HTTPException(
            status_code=400,
            detail="Empty text received.",
        )

    if not check_api_key_configured():
        return {
            "success": False,
            "error": "GEMINI_API_KEY is not configured",
            "response": {
                "text": "My GEMINI_API_KEY is not configured yet in backend/.env.",
                "emotion": "neutral",
                "should_speak": True,
            },
        }

    try:
        result = await airi_brain.respond(payload.text)
        return result

    except HTTPException:
        raise
    except Exception as error:
        error_msg = str(error)
        print("Brain error:", repr(error))
        if "GEMINI_API_KEY is not configured" in error_msg:
            return {
                "success": False,
                "error": "GEMINI_API_KEY is not configured",
                "response": {
                    "text": "My GEMINI_API_KEY is not configured yet in backend/.env.",
                    "emotion": "neutral",
                    "should_speak": True,
                },
            }
        return {
            "success": False,
            "error": "brain_unavailable",
            "detail": error_msg,
            "response": {
                "text": (
                    "Sorry, I couldn't connect to my AI service right now. "
                    "Please try again in a moment."
                ),
                "emotion": "concerned",
                "should_speak": True,
            },
        }


@app.post("/voice/tts")
async def generate_tts(payload: TtsRequest):
    return await tts_service.generate_speech(
        text=payload.text,
        voice=payload.voice,
        emotion=payload.emotion or airi_brain.emotions.get_current_emotion(),
    )


@app.post("/session/reset")
async def reset_session():
    """Reset the live conversation. Permanent memories are preserved."""

    return airi_brain.reset_session()


@app.get("/session/context")
async def session_context():
    return airi_brain.get_context_snapshot()


@app.get("/memory")
async def get_memory(
    query: str = Query(default=""),
    limit: int | None = Query(default=None, ge=1, le=200),
):
    return {
        "success": True,
        "relevance": query,
        "memory": memory_store.search_long_term(query, limit=limit),
    }


@app.get("/memory/short-term")
async def get_short_term_memory(
    limit: int | None = Query(default=None, ge=1, le=200),
):
    return {
        "success": True,
        "memory": memory_store.get_short_term(limit),
    }


@app.post("/memory")
async def save_memory(payload: MemorySaveRequest):
    entry = memory_store.save_long_term(
        key=payload.key,
        value=payload.value,
        category=payload.category,
        confidence=payload.confidence,
    )
    return {
        "success": True,
        "entry": entry,
    }


@app.delete("/memory")
async def clear_memory():
    """Explicitly wipe every stored memory (short-term + long-term)."""

    memory_store.clear()
    return {
        "success": True,
        "cleared": True,
    }


@app.delete("/memory/{key}")
async def delete_memory(key: str):
    deleted = memory_store.delete_long_term(key)
    return {
        "success": deleted,
    }


@app.get("/emotion")
async def get_emotion():
    return {
        "current_emotion": airi_brain.emotions.get_current_emotion(),
        "supported": sorted(VALID_EMOTIONS),
    }


@app.post("/emotion")
async def update_emotion(payload: EmotionUpdateRequest):
    new_emotion = airi_brain.emotions.update_emotion(
        suggested_emotion=payload.emotion
    )
    return {
        "success": True,
        "requested_emotion": payload.emotion,
        "current_emotion": normalize_emotion(new_emotion),
    }
