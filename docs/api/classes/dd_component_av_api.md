# dd_component_av_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_component_3d_api](dd_component_3d_api.md) · [dispatch](dispatch.md)

Audio/video component helpers: stream metadata for the player, posterframe create/delete, and the index-row fragment download.

Registered actions (`src/core/api/handlers/dd_component_av_api.ts`): `create_posterframe`, `delete_posterframe`, `get_media_streams`, `download_fragment`.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_component_av_api"` and `action` set to one of the four.
- The record coordinates ride in `rqo.source` (`tipo`, `section_tipo`, `section_id`); the media parameters ride in `rqo.options`.

## Common contract

Every action resolves the same media context first, and refuses in the same order:

- `source.tipo`, `source.section_tipo` and a **positive integer** `source.section_id` are required — `section_id` is a matrix record address, never a string.
- Section permission on `source.section_tipo`: **write (level ≥ 2)** for the two posterframe actions, **read (level ≥ 1)** for `get_media_streams` and `download_fragment`.
- `source.tipo` must actually carry the model **`component_av`**.
- All four require a session, and the dispatcher's CSRF gate applies to every action of this class.
- Envelope: **v2**. Success is `{ ok: true, request_id, data, … }`; a refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }`. There is no `result` key — the v1 `{ result, msg, errors }` shape was removed on 2026-08-16.

### Errors (all actions)

| code | when |
| --- | --- |
| `request.invalid_source` | `tipo` / `section_tipo` missing, or `section_id` is not a positive int. |
| `perm.denied` | section permission below the action's level. |
| `request.invalid_model` | `source.tipo` is not a `component_av`. |
| `media.action_failed` | the media operation failed (ffprobe/ffmpeg, missing spec, fragment build). The engine's own reason names filesystem paths, so it stays on the log line and the `cause` chain — never on the wire. |

!!! note
    The examples below use the `monedaiberica` install: `rsc35` is the `component_av` ("Audiovisual") of the **Audiovisual** section `rsc167` (a virtual section of `rsc2`), and `528` is a real record of it. Another install's tipos differ.

## get_media_streams

### Purpose

Probe the AV file at a quality and return its stream metadata. The AV player's edit view calls this on **every** render — the view cannot open without it.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id`, optional `lang`.
- `options.quality`: string (optional) — the quality to probe; the component's default quality when absent.

### Returns

`{ ok: true, data: { streams: [ … ] } }`, or `data: null` when no file exists at that quality. The client reads the stream list off `data`.

### Example request

```json
{
  "dd_api": "dd_component_av_api",
  "action": "get_media_streams",
  "source": { "tipo": "rsc35", "section_tipo": "rsc167", "section_id": 528 },
  "options": { "quality": "high" }
}
```

### Example response (truncated)

```json
{
  "ok": true,
  "request_id": "c0ffee20",
  "data": {
    "streams": [
      { "index": 0, "codec_name": "h264", "width": 720, "height": 404, "r_frame_rate": "25/1" }
    ]
  }
}
```

## create_posterframe

### Purpose

Grab a posterframe image at a given time of the video.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id`.
- `options.current_time`: number (required in practice; defaults to `0`) — the timecode in seconds.

### Returns

`{ ok: true, data: <boolean> }`. A posterframe write is always a thumb change too — the thumb is a picture of the posterframe — and on success the record's `files_info` is persisted.

### Example request

```json
{
  "dd_api": "dd_component_av_api",
  "action": "create_posterframe",
  "source": { "tipo": "rsc35", "section_tipo": "rsc167", "section_id": 528 },
  "options": { "current_time": 17.85 }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee21",
  "data": true
}
```

## delete_posterframe

### Purpose

Remove a previously generated posterframe.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id`.

### Returns

`{ ok: true, data: <boolean> }` — `false` when there was no file to delete. That is a falsy **success**, not an error. An activity row is written only on a real deletion, never for a no-op.

### Example request

```json
{
  "dd_api": "dd_component_av_api",
  "action": "delete_posterframe",
  "source": { "tipo": "rsc35", "section_tipo": "rsc167", "section_id": 528 }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee22",
  "data": true
}
```

## download_fragment

### Purpose

Cut the clip an AV index entry points at and answer its URL — the *Download fragment* button on every index row.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id`, plus `tag_id` (the index entry).
- `options.quality`: string (optional) — the source quality; the component default when absent.
- `options.tc_in_secs` / `options.tc_out_secs`: number — the cut window in seconds.
- `options.watermark`: boolean (optional).

### Returns

`{ ok: true, data: "<url>" }` — the URL of the cut file.

!!! note
    The gate is section **read** (level ≥ 1) even though the action writes a file. The output is a derivative of bytes the caller may already stream in the player, and the button lives on every index row a consultation user can open — raising the bar would silently remove the capability from the users it exists for. A long clip really can take an hour, so the handler imposes no budget of its own; the producer's inactivity cap is what distinguishes slow from wedged.

### Example request

```json
{
  "dd_api": "dd_component_av_api",
  "action": "download_fragment",
  "source": { "tipo": "rsc35", "section_tipo": "rsc167", "section_id": 528, "tag_id": "1" },
  "options": { "tc_in_secs": 12.5, "tc_out_secs": 48.0, "watermark": false }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee23",
  "data": "/media/av/fragments/rsc35_rsc167_528_1.mp4"
}
```
