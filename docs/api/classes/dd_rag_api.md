# dd_rag_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [Semantic search / RAG](../../core/ai/rag.md) · [dispatch](dispatch.md)

Semantic retrieval over the repository: meaning-based record search, passage retrieval for an LLM, "records like this seed", grounded cited answers, the section's embed-group facets, and — behind a second switch — the image-similarity layer.

Registered actions (`src/ai/rag/api.ts`): `semantic_search`, `embed_groups`, `retrieve`, `get_agent_context`, `similar_to`, `ask`, `similar_objects`, `search_by_text_image`, `characterize_object`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_rag_api"` and `action: "<method>"`.
- All parameters ride in `rqo.options`.

## Notes

- Every action requires a **session** (none is in `NO_LOGIN_ACTIONS`) and is **CSRF-gated** by the dispatcher.
- The whole class fails closed on the `DEDALO_RAG_ENABLED` kill-switch: while off, every action returns `{ result: false, msg: "RAG is disabled", errors: ["rag_disabled"] }`.
- The three image actions (`similar_objects`, `search_by_text_image`, `characterize_object`) are gated by a **second** switch, `DEDALO_RAG_MEDIA_ENABLED`; with media off they return `{ result: false, msg: "RAG media is disabled", errors: ["media_disabled"] }`.
- **Results are ACL-gated inside `src/ai/rag/retrieval.ts`** (schema ACL + per-record projects filter) — the retrieval chokepoint, not the handler. A caller never sees a record they could not read directly.
- The retrieval actions accept an optional `group` — an embed-group facet id validated against a slug grammar and applied as a bound filter (never raw SQL). `limit` is clamped to `[1, 50]` (default 10).

## semantic_search

### Purpose

Meaning-based record search — the single best record per semantic hit.

### Accepts

- `options`: object (required)
  - `query`: string (required)
  - `section_tipo`: string | array (optional) — scope
  - `limit`: int (optional, `[1, 50]`, default 10)
  - `group`: string (optional) — embed-group facet id

### Returns

`{ result: [ <hit> ], msg: "ok", errors: [] }`. A missing `query` returns `{ result: false, msg: "Missing query", errors: ["missing_query"] }`.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "semantic_search",
  "options": { "query": "silver coins from the 3rd century", "section_tipo": "oh1", "limit": 10 }
}
```

## embed_groups

### Purpose

Return the section's embed-group ids — the client's facet selector and its "is this section semantic-searchable?" gate.

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required)

### Returns

`{ result: { groups: [ <id> ] }, msg: "ok", errors: [] }`.

### Usage

After the kill-switch, a malformed tipo, a section the caller cannot read, and a section without a `rag.embed` descriptor all return the **same** `{ groups: [] }` — byte-identical on purpose, so the endpoint is never a section-existence oracle.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "embed_groups",
  "options": { "section_tipo": "oh1" }
}
```

## retrieve

### Purpose

Retrieve passages (chunks) that best match a query.

### Accepts

- `options`: object (required)
  - `query`: string (required)
  - `section_tipo`: string | array (optional) — scope
  - `limit`: int (optional, `[1, 50]`, default 10)
  - `group`: string (optional)

### Returns

`{ result: [ <passage> ], msg: "ok", errors: [] }`.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "retrieve",
  "options": { "query": "conservation treatment", "limit": 8 }
}
```

## get_agent_context

### Purpose

Retrieve passages shaped as LLM context (same passage retrieval as `retrieve`, different response `msg`).

### Accepts

- Same as `retrieve` (`query`, optional `section_tipo`, `limit`, `group`).

### Returns

`{ result: [ <passage> ], msg: "agent_context", errors: [] }`.

## similar_to

### Purpose

Records similar to a seed record.

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required) — the seed's section
  - `section_id`: int (required) — the seed record
  - `limit`: int (optional, `[1, 50]`, default 10)
  - `group`: string (optional)

### Returns

`{ result: [ <hit> ], msg: "ok", errors: [] }`. A missing/invalid seed returns `{ result: false, msg, errors: ["missing_seed"] }`.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "similar_to",
  "options": { "section_tipo": "oh1", "section_id": 3, "limit": 10 }
}
```

## ask

### Purpose

Grounded question answering with citations — or a refusal when no context is found.

### Accepts

- `options`: object (required)
  - `query`: string (required)
  - `section_tipo`: string | array (optional) — scope
  - `limit`: int (optional, `[1, 50]`, default 10)

### Returns

`{ result: <answer object>, msg, errors }`. `msg` is `"ok"` for a grounded answer; a grounding miss and an egress-restricted record are both **normal** envelopes (no external model was called) with a distinct `msg`; an LLM transport failure returns `{ result: false, msg: "Generation failed", errors: ["generation_failed"] }` (never a fabricated answer).

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "ask",
  "options": { "query": "When was the site excavated?", "section_tipo": "oh1" }
}
```

## similar_objects

### Purpose

Visual object similarity from a seed record's stored image vectors.

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required) — the seed's section
  - `section_id`: int (required) — the seed record
  - `similarity_mode`: string (optional) — `visual` or `hybrid` (default)
  - `view`: string (optional)
  - `near_duplicate`: boolean (optional) — apply the near-duplicate similarity floor
  - `limit`: int (optional, `[1, 50]`, default 10)
  - `section_tipo` scope (optional) — defaults to the seed section's configured compare scope

### Returns

`{ result: [ <object> ], msg: "ok", errors: [] }` — each object carries `section_tipo`, `section_id`, `similarity`, `score`, `view`, `thumb_url`, `context`.

### Usage

Additionally requires `DEDALO_RAG_MEDIA_ENABLED`.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "similar_objects",
  "options": { "section_tipo": "rsc167", "section_id": 2, "similarity_mode": "hybrid" }
}
```

## search_by_text_image

### Purpose

A text query into the image space (joint text/image tower).

### Accepts

- `options`: object (required)
  - `query`: string (required)
  - `section_tipo`: string | array (optional) — scope
  - `limit`: int (optional, `[1, 50]`, default 10)

### Returns

`{ result: [ <object> ], msg: "ok", errors: [] }` (same object shape as `similar_objects`).

### Usage

Additionally requires `DEDALO_RAG_MEDIA_ENABLED`.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "search_by_text_image",
  "options": { "query": "red-figure amphora", "limit": 12 }
}
```

## characterize_object

### Purpose

Neighbour-aggregated typology/period proposals for a seed object (no LLM — proposals are aggregated from visually similar neighbours).

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required) — the seed's section
  - `section_id`: int (required) — the seed record

### Returns

`{ result: <characterization>, msg: "ok", errors: [] }`. A missing/invalid seed returns `{ result: false, msg, errors: ["missing_seed"] }`.

### Usage

Additionally requires `DEDALO_RAG_MEDIA_ENABLED`.

### Example Request

```json
{
  "dd_api": "dd_rag_api",
  "action": "characterize_object",
  "options": { "section_tipo": "rsc167", "section_id": 2 }
}
```
