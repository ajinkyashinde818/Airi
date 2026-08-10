from dotenv import load_dotenv

load_dotenv()

from fastapi import (
    FastAPI,
    File,
    UploadFile,
    HTTPException,
)

from fastapi.middleware.cors import CORSMiddleware

from vision.vision_service import vision_service


app = FastAPI(
    title="Airi API",
    version="0.1.0"
)


app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


@app.get("/")
async def root():

    return {
        "name": "Airi",
        "status": "online",
    }


@app.get("/health")
async def health():

    return {
        "status": "healthy",
    }


@app.post("/vision/frame")
async def receive_frame(
    image: UploadFile = File(...)
):

    try:

        image_data = await image.read()

        if not image_data:

            raise HTTPException(
                status_code=400,
                detail="Empty image received.",
            )

        result = await vision_service.analyze(
            image_data
        )

        return result

    except HTTPException:
        raise

    except Exception as error:

        print(
            "Vision error:",
            repr(error)
        )

        raise HTTPException(
            status_code=502,
            detail=str(error),
        )


@app.get("/vision/context")
async def get_visual_context():

    return vision_service.get_context()
