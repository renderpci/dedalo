# dd_component_3d_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_component_av_api](dd_component_av_api.md) · [dispatch](dispatch.md)

Posterframe handling for a **3D** component: bind a client-rendered canvas snapshot to the record, or unlink it again.

Registered actions (`src/core/api/handlers/dd_component_3d_api.ts`): `move_file_to_dir`, `delete_posterframe`.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_component_3d_api"` and `action` set to one of the two.
- The record coordinates ride in `rqo.source` (`tipo`, `section_tipo`, `section_id`); everything else rides in `rqo.options`.

## Common contract

Both actions resolve the same media context first, and refuse in the same order:

- `source.tipo`, `source.section_tipo` and a **positive integer** `source.section_id` are required — `section_id` is a matrix record address, never a string.
- Section **write** permission (level ≥ 2) on `source.section_tipo`.
- `source.tipo` must actually carry the model **`component_3d`**; a component of any other model is refused rather than treated as a 3D asset.
- Both are section writes: a session is required and the dispatcher's CSRF gate applies (neither action is in the no-login or CSRF-exempt sets).
- Envelope: **v2**. Success is `{ ok: true, request_id, data, … }`; a refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }`. There is no `result` key — the v1 `{ result, msg, errors }` shape was removed on 2026-08-16.

### Errors (both actions)

| code | when |
| --- | --- |
| `request.invalid_source` | `tipo` / `section_tipo` missing, or `section_id` is not a positive int. |
| `perm.denied` | section permission level < 2. |
| `request.invalid_model` | `source.tipo` is not a `component_3d`. |
| `media.action_failed` | the media spec could not be resolved (the engine reason is log-only). |

## move_file_to_dir

### Purpose

Bind a **staged upload** to the 3D record. The tool's *Create posterframe* button uploads the browser-rendered canvas snapshot to the staging tree, then calls this action with `target_dir: "posterframe"` to install it.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id`.
- `options.target_dir`: string (required) — the media directory to bind into (`posterframe` for the snapshot flow).
- `options.file_data`: object (required) — `name`, `key_dir`, `tmp_name`. All three must be non-empty; the staged file's real source path is rebuilt server-side from the upload allowlist, never taken from the request.

### Returns

`{ ok: true, data: true }`. The bind also rebuilds the thumb from the posterframe and **persists** the record's `files_info`, so list mode sees the new picture instead of the placeholder.

### Errors

Beyond the common table: `request.invalid_options` (a missing `target_dir` or `file_data` field) and `resource.not_found` (no staged upload at `key_dir`/`tmp_name`). A missing staged file is a **refusal**, not a falsy success — nothing was bound, so the queue row must not be cleared as if it had been.

### Example request

```json
{
  "dd_api": "dd_component_3d_api",
  "action": "move_file_to_dir",
  "source": { "tipo": "rsc201", "section_tipo": "rsc202", "section_id": 2 },
  "options": {
    "file_data": { "name": "snapshot.png", "key_dir": "3d", "tmp_name": "tmp_snapshot.png" },
    "target_dir": "posterframe"
  }
}
```

!!! note
    `rsc201` is the `component_3d` ("3D file") of the `monedaiberica` install, and `rsc202` ("3D document") is its virtual section of `rsc2`. Another install's tipos differ — read the section's own children to find its 3D component.

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee10",
  "data": true
}
```

## delete_posterframe

### Purpose

Unlink the 3D posterframe.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id`.

### Returns

`{ ok: true, data: <boolean> }` — `false` when there was no posterframe to remove. That is a falsy **success**, not an error: re-issuing the request is safe.

!!! warning
    Deleting the posterframe **retires the thumb with it** — the thumb is a picture of the posterframe and nothing here can re-render a mesh, so the record falls back to its placeholder. On a real deletion the stored `files_info` is persisted (3D is not re-scanned per read, unlike audiovisual) and an activity row is written.

### Example request

```json
{
  "dd_api": "dd_component_3d_api",
  "action": "delete_posterframe",
  "source": { "tipo": "rsc201", "section_tipo": "rsc202", "section_id": 2 }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee11",
  "data": true
}
```
