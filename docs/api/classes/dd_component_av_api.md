# dd_component_av_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_component_3d_api](dd_component_3d_api.md)

Audio/video component API: media-streaming helpers, posterframe creation and deletion, and fragment download.

Registered actions (`src/core/api/dispatch.ts`): `create_posterframe`, `delete_posterframe`, `get_media_streams`. All three require section permission (posterframes: write, level 2; streams: read, level 1) and, being writes, `create_posterframe` / `delete_posterframe` are CSRF-gated. Media-context resolution lives in `src/core/media/tools/posterframe.ts`.

## How to call

- POST JSON with `dd_api: "dd_component_av_api"` and `action` set to `get_media_streams`, `create_posterframe`, or `delete_posterframe`.

## Common fields

- `source` should include `tipo`, `section_tipo`, and a positive `section_id`; `options` carries the media parameters (quality, timestamp).

> **Gap**: PHP `download_fragment` is **not registered** in the TS action registry.

## get_media_streams

- **Purpose:** List available streams and renditions for a media asset.
- **Accepts:** `source.tipo`, `source.section_tipo`, `source.section_id`, optional `source.lang`; `options.quality` (optional) to select quality.
- **Returns:** object `result` containing media streams info (object with `streams` array; see sample in source code comments).

### Example Request: get_media_streams

```json
{
  "dd_api": "dd_component_av_api",
  "action": "get_media_streams",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2" },
  "options": { "quality": "high" }
}

```

### Example Response (truncated sample)

```json
{
  "result": {
    "streams": [
      { "index": 0, "codec_name": "h264", "width": 720, "height": 404, "r_frame_rate": "25/1" }
    ]
  },
  "msg": ["OK. Request done"],
  "errors": []
}

```

## create_posterframe

- **Purpose:** Generate a posterframe image at a given time.
- **Accepts:** `source.tipo`, `source.section_tipo`, `source.section_id`; `options.current_time` (float seconds) and optional `options.quality`.
- **Returns:** boolean `response.result` indicating success; `msg` contains status.

### Example Request: create_posterframe

```json
{
  "dd_api": "dd_component_av_api",
  "action": "create_posterframe",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2" },
  "options": { "current_time": 17.85 }
}

```

### Example Response: create_posterframe

```json
{
  "result": true,
  "msg": "OK. Request done dd_component_av_api::create_posterframe",
  "errors": []
}

```

## delete_posterframe

- **Purpose:** Delete a previously generated posterframe.
- **Accepts:** `source.tipo`, `source.section_tipo`, `source.section_id`.
- **Returns:** boolean `response.result` indicating success and `msg` with status.

### Example Request: delete_posterframe

```json
{
  "dd_api": "dd_component_av_api",
  "action": "delete_posterframe",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2" }
}

```

### Example Response: delete_posterframe

```json
{
  "result": true,
  "msg": "OK. Request done dd_component_av_api::delete_posterframe",
  "errors": []
}
```
