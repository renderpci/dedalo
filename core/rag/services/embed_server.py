#!/usr/bin/env python3
"""
embed_server.py — reference LOCAL embedding sidecar for Dédalo RAG (dev/test).

One small HTTP service that provides BOTH the text and the multimodal (image+text)
embeddings the RAG subsystem needs, with no paid API and nothing leaving the host —
so it is also safe for restricted/non-publishable material.

It implements the exact contracts the PHP providers expect:

  TEXT  (embedding_provider_local_http → DEDALO_RAG_ENDPOINT)
    POST /embed   {"model": "...", "input": ["text", ...]}   -> {"embeddings": [[...], ...]}

  MULTIMODAL (embedding_provider_multimodal → DEDALO_RAG_MULTIMODAL_ENDPOINT)
    POST /text    {"model": "...", "input":  ["text", ...]}  -> {"embeddings": [[...], ...]}
    POST /image   {"model": "...", "images": ["<base64 jpeg>", ...]} -> {"embeddings": [[...], ...]}

The /text and /image endpoints share ONE CLIP model, so a text query and an image
land in the same joint space (text→image search works). Vectors are L2-normalized
(cosine-ready). Models load lazily on first use.

Run:
    pip install -r requirements.txt
    uvicorn embed_server:app --host 127.0.0.1 --port 8090

Then in Dédalo config:
    DEDALO_RAG_ENDPOINT            = http://127.0.0.1:8090/embed
    DEDALO_RAG_MODEL              = paraphrase-multilingual-MiniLM-L12-v2
    DEDALO_RAG_MULTIMODAL_ENDPOINT = http://127.0.0.1:8090
    DEDALO_RAG_MULTIMODAL_MODEL    = clip-ViT-B-32

Override the default models with env vars RAG_TEXT_MODEL / RAG_CLIP_MODEL.
This is a reference implementation for local testing — not a production server.
"""

import base64
import io
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Heavy ML imports are deferred until a model is actually needed, so the process
# starts fast and a missing optional dep only fails the endpoint that needs it.
_text_model = None
_clip_model = None

TEXT_MODEL_NAME = os.environ.get("RAG_TEXT_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
CLIP_MODEL_NAME = os.environ.get("RAG_CLIP_MODEL", "clip-ViT-B-32")

app = FastAPI(title="Dédalo RAG embedding sidecar", version="1.0")


def _get_text_model():
    global _text_model
    if _text_model is None:
        from sentence_transformers import SentenceTransformer
        _text_model = SentenceTransformer(TEXT_MODEL_NAME)
    return _text_model


def _get_clip_model():
    global _clip_model
    if _clip_model is None:
        from sentence_transformers import SentenceTransformer
        _clip_model = SentenceTransformer(CLIP_MODEL_NAME)
    return _clip_model


def _encode(model, items) -> List[List[float]]:
    # normalize_embeddings=True → cosine-ready unit vectors
    vectors = model.encode(items, normalize_embeddings=True, convert_to_numpy=True)
    return [[float(x) for x in row] for row in vectors]


class TextRequest(BaseModel):
    model: Optional[str] = None
    input: List[str]


class ImageRequest(BaseModel):
    model: Optional[str] = None
    images: List[str]  # base64-encoded image bytes (e.g. JPEG)


class EmbeddingsResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    dimension: int


@app.get("/health")
def health():
    return {"status": "ok", "text_model": TEXT_MODEL_NAME, "clip_model": CLIP_MODEL_NAME}


@app.post("/embed", response_model=EmbeddingsResponse)
def embed_text(req: TextRequest):
    """Text embeddings for the RAG text provider (DEDALO_RAG_ENDPOINT)."""
    if not req.input:
        return {"embeddings": [], "model": TEXT_MODEL_NAME, "dimension": 0}
    try:
        vectors = _encode(_get_text_model(), req.input)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"text embed failed: {e}")
    return {"embeddings": vectors, "model": TEXT_MODEL_NAME, "dimension": len(vectors[0]) if vectors else 0}


@app.post("/text", response_model=EmbeddingsResponse)
def embed_text_for_image_search(req: TextRequest):
    """Text tower of the CLIP model — joint space with /image (text→image search)."""
    if not req.input:
        return {"embeddings": [], "model": CLIP_MODEL_NAME, "dimension": 0}
    try:
        vectors = _encode(_get_clip_model(), req.input)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"clip text embed failed: {e}")
    return {"embeddings": vectors, "model": CLIP_MODEL_NAME, "dimension": len(vectors[0]) if vectors else 0}


@app.post("/image", response_model=EmbeddingsResponse)
def embed_image(req: ImageRequest):
    """Image tower of the CLIP model — base64 JPEG in, joint-space vector out."""
    if not req.images:
        return {"embeddings": [], "model": CLIP_MODEL_NAME, "dimension": 0}
    try:
        from PIL import Image
        images = []
        for b64 in req.images:
            raw = base64.b64decode(b64)
            images.append(Image.open(io.BytesIO(raw)).convert("RGB"))
        vectors = _encode(_get_clip_model(), images)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"clip image embed failed: {e}")
    return {"embeddings": vectors, "model": CLIP_MODEL_NAME, "dimension": len(vectors[0]) if vectors else 0}
