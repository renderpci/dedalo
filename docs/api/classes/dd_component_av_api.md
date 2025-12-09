# dd_component_av_api

Overview

- Audio/Video component API: media streaming helpers, posterframe creation/deletion and fragment download.

How to call

- POST JSON with `dd_api: "dd_component_av_api"` and `action` such as `get_media_streams`, `create_posterframe`, `delete_posterframe`, `download_fragment`.

Common fields

- `source` should include file locators or identifiers; `options` contains media parameters (quality, target folder, timestamps for fragments).

Methods

## download_fragment

- **Purpose:** Retrieve a media fragment (time range) from an AV asset.
- **Accepts:** `source.tipo` (component tipo), `source.section_tipo`, `source.section_id`, optional `source.tag_id`, optional `source.lang`; `options.quality`, `options.tc_in_secs`, `options.tc_out_secs`, optional `options.watermark` (bool).
- **Returns:** on success `response.result` is a URL string to the generated fragment; `msg` contains status and `errors` on failure.

### Example Request: download_fragment

```json
{
  "dd_api": "dd_component_av_api",
  "action": "download_fragment",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2", "tag_id": "5" },
  "options": { "quality": "high", "tc_in_secs": 30, "tc_out_secs": 60, "watermark": false }
}

```

### Example Response (success)

```json
{
  "result": "https://example.org/media/fragments/fragment_rsc36_rsc167_2_5.mp4",
  "msg": "OK. Request done successfully",
  "errors": []
}

```

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
