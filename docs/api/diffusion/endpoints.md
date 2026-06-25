# API endpoints: Bun diffusion

> See also: [Architecture](architecture.md) · [Data model](data_model.md) · [Diffusion engine (hub)](README.md)

The Bun Diffusion API exposes two main actions over its Unix socket. Both are dispatched by `action` in the JSON request body.

## 1. `diffuse` (action)

Starts a diffusion process and returns a real-time streaming response.

- **URL**: `POST /`
- **Content-Type**: `application/json`
- **Accept**: `text/event-stream`

### Request Body (RQO)

```json
{
  "action": "diffuse",
  "source": {
    "diffusion_element_tipo": "rsc264",
    "diffusion_tipo": "rsc264"
  },
  "sqo": {
    "section_tipo": ["rsc170"]
  },
  "options": {
    "levels": 1,
    "total": 5400,
    "chunk_size": 100
  }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.total` | `number` | **Recommended**. The total records for the main section. Enables scaling via chunked PHP calls. |
| `options.chunk_size` | `number` | Records per PHP call. Default: `100`. |

### Response: NDJSON / SSE stream

The response is a stream of JSON objects, each prefixed with `data:\n` and followed by `\n\n`.

#### a) Initial chunk
Contains the `process_id` for reconnection tracking.
```json
data:
{"process_id":"550e8400-e29b-41d4-a716-446655440000","is_running":true,"data":{"msg":"Starting diffusion...","counter":0,"total":5400}}
```

#### b) Progress chunk
Sent after each table chunk is processed and inserted.
```json
data:
{"is_running":true,"data":{"msg":"Processing records","counter":100,"total":5400,"section_label":"images","current":{"section_id":"42","time":150},"total_ms":3200}}
```
> **Note**: `counter` represents source records handled, including those that were deleted.

#### c) Final chunk
Contains the summary of results.
```json
data:
{"is_running":false,"result":{"result":true,"msg":"OK. Processed 12 table(s), 5400 record(s) in 54 chunk(s)","tables":[]}}
```

---

## 2. `get_process_status` (action)

Polls the state of an active or finished process for reconnection.

- **URL**: `POST /`
- **Content-Type**: `application/json`
- **Accept**: `text/event-stream`

### Request Body

```json
{
  "action": "get_process_status",
  "process_id": "550e8400-e29b-41d4-a716-446655440000",
  "update_rate": 1000
}
```

### Response
Returns the same SSE stream format as `diffuse`, but reading from the in-memory `Progress Store`. If the process is finished, it sends the final state and terminates the stream.
