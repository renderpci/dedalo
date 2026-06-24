# Dédalo RAG embedding sidecar (reference, dev/test)

A minimal **local** HTTP service that provides the text and image embeddings the
RAG subsystem needs, with no paid API and nothing leaving the host. Use it to test
RAG end-to-end on a dev install. It is a reference implementation — for production,
swap in a hardened model server (TEI, Ollama, a managed multimodal API, etc.); the
PHP providers only care about the HTTP contract below.

## What it serves

| Endpoint | Used by (PHP) | Request | Response |
|----------|---------------|---------|----------|
| `POST /embed` | text provider (`DEDALO_RAG_ENDPOINT`) | `{model, input:[text]}` | `{embeddings:[[…]]}` |
| `POST /text`  | multimodal text tower (`DEDALO_RAG_MULTIMODAL_ENDPOINT`) | `{model, input:[text]}` | `{embeddings:[[…]]}` |
| `POST /image` | multimodal image tower | `{model, images:[base64]}` | `{embeddings:[[…]]}` |
| `GET /health` | — | — | `{status, …}` |

`/text` and `/image` share one CLIP model, so a text query and an image land in the
same space (text→image search works). Vectors are L2-normalized (cosine-ready).

## Run

```bash
cd core/rag/services
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn embed_server:app --host 127.0.0.1 --port 8090
# first call downloads the models (a few hundred MB); CPU is fine for testing
```

Quick check:
```bash
curl -s localhost:8090/health
curl -s localhost:8090/embed -H 'content-type: application/json' \
  -d '{"input":["hola mundo","blue-and-white ceramic"]}' | head -c 120
```

## Point Dédalo at it (`../private/.env`)

RAG settings are declared in the config catalog (`core/base/config/catalog/domains/rag.php`)
and set per-install in `../private/.env` by constant name (one `KEY=VALUE` per line):

```dotenv
DEDALO_RAG_ENABLED=true
# text
DEDALO_RAG_ENDPOINT=http://127.0.0.1:8090/embed
DEDALO_RAG_MODEL=paraphrase-multilingual-MiniLM-L12-v2   # ~384-dim, multilingual
# images
DEDALO_RAG_MEDIA_ENABLED=true
DEDALO_RAG_MULTIMODAL_ENDPOINT=http://127.0.0.1:8090
DEDALO_RAG_MULTIMODAL_MODEL=clip-ViT-B-32               # ~512-dim joint image+text
# the separate pgvector DB
DEDALO_RAG_DB_HOSTNAME_CONN=localhost
DEDALO_RAG_DB_DATABASE_CONN=dedalo_rag
DEDALO_RAG_DB_USERNAME_CONN=dedalo_rag
DEDALO_RAG_DB_PASSWORD_CONN=...                          # secret (env-only)
```

Default models can be overridden with env vars `RAG_TEXT_MODEL` / `RAG_CLIP_MODEL`.

## Notes

- **Local only ⇒ egress is moot.** To exercise the egress gate, configure an
  *external* multimodal provider and confirm a non-publishable object's image is
  skipped (see `core/rag/README.md` security section).
- `clip-ViT-B-32` is a general model — good for "blue ceramic vase", weaker on
  fine-grained numismatic typology. It is a fine starting default; the provider is
  pluggable, so a heritage-tuned encoder can replace it without code changes.
