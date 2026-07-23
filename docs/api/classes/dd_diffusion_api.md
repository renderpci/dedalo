# dd_diffusion_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [The diffusion engine](../../diffusion/native_engine.md) · [dispatch](dispatch.md)

Publication / diffusion control plane: launch a rebuild, follow or cancel a running process, read diffusion info and engine advisories, and run the admin resync operations. The copied `tool_diffusion` client reaches these through its main-API fallback; the actions are served natively by the core dispatcher (jobs + spawned runner processes).

Registered actions (`src/core/api/dispatch.ts`): `diffuse`, `get_process_status`, `list_processes`, `cancel_process`, `get_diffusion_info`, `get_engine_advisory`, `retry_pending_deletions`, `validate`, `rebuild_media_index`. The handlers delegate to the diffusion action facade (`src/diffusion/api/actions.ts`); wire shapes are pinned in `test/parity/fixtures/diffusion/pinned.ts`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_diffusion_api"` and `action: "<method>"`.

## Notes

- Every action requires a session (none is in `NO_LOGIN_ACTIONS`) and, being state-changing or job-driving, passes the dispatcher's CSRF gate.
- `retry_pending_deletions`, `validate` and `rebuild_media_index` are **global-admin only** — cross-section background operations a non-admin must not be able to trigger. An unauthorized caller gets an HTTP-200 `result: false` with `errors: ["insufficient permissions"]`.
- `diffuse` and `get_process_status` return **SSE streams**, not a single JSON body; `get_process_status` is owner-scoped (the client-supplied `process_id` is guessable, so a process streams only to its owner).

## diffuse

### Purpose

Launch a diffusion (publication) rebuild for an element over a scoped record set, and follow its progress.

### Accepts

- `options`: object (required)
  - `diffusion_element_tipo`: string (required; `diffusion_tipo` is accepted as a fallback) — the diffusion element to run
  - `process_id`: string (optional) — the client's label for the process, echoed back for reconnection
  - `total`: int (optional) — an estimated record total for the progress UI
  - `type`: string (optional, default `"sql"`) — the target type
- `sqo`: object (required) — `sqo.section_tipo` scopes the record search and provides the element's section.

### Returns

An SSE stream of progress frames following the launched job. A missing `sqo.section_tipo` or `options.diffusion_element_tipo` returns `{ result: false, msg, errors }`.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "diffuse",
  "options": {
    "diffusion_element_tipo": "dd1234",
    "process_id": "diff_oh1_1700000000",
    "type": "sql"
  },
  "sqo": { "section_tipo": ["oh1"] }
}
```

## get_process_status

### Purpose

Reconnect to a running diffusion process and stream its progress.

### Accepts

- `process_id`: string (required, top-level) — the client label supplied to `diffuse`.
- `update_rate`: int (optional) — poll cadence.

### Returns

An SSE stream of progress frames. Owner-scoped: a process streams only to the user that launched it. A missing `process_id` yields an error frame.

## list_processes

### Purpose

List the caller's recent diffusion processes.

### Accepts

- No arguments.

### Returns

`{ result: true, processes: [ <progress_data> ] }` — the processes within the recent (24h) window.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "list_processes"
}
```

## cancel_process

### Purpose

Cancel a running diffusion process.

### Accepts

- `process_id`: string (required, top-level).

### Returns

`{ result: <cancelled bool>, msg: string, errors: [] }`. A missing/invalid `process_id` returns `{ result: false, msg, errors: ["invalid_process_id"] }`.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "cancel_process",
  "process_id": "diff_oh1_1700000000"
}
```

## get_diffusion_info

### Purpose

Return diffusion configuration/status info for a section.

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required)

### Returns

`{ result: <info>, msg: "Diffusion info retrieved successfully", errors: [] }`. A missing `section_tipo` returns `{ result: false, msg, errors }`.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "get_diffusion_info",
  "options": { "section_tipo": "oh1" }
}
```

## get_engine_advisory

### Purpose

Return the diffusion engine advisory (state, title and readiness checks) the client reads at the top level of the body.

### Accepts

- No arguments.

### Returns

The advisory object (`state`, `title`, `checks`), tailored to whether the caller is a global admin.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "get_engine_advisory"
}
```

## retry_pending_deletions

### Purpose

Re-drive the global pending-unpublish (`dd1758`) queue — retry deletions that could not complete earlier.

### Accepts

- No arguments.

### Returns

`{ result: true, msg: "Retried <n> of <m> pending deletions (<k> remaining)", retried, total, remaining }`.

### Usage

**Global-admin only.**

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "retry_pending_deletions"
}
```

## validate

### Purpose

Compile a diffusion element's plan and report its errors and warnings — the loud pre-run gate.

### Accepts

- `options`: object (required)
  - `diffusion_element_tipo`: string (required)

### Returns

The validation object (errors / warnings). A missing `diffusion_element_tipo` returns `{ result: false, msg, errors: ["invalid_request"] }`.

### Usage

**Global-admin only.**

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "validate",
  "options": { "diffusion_element_tipo": "dd1234" }
}
```

## rebuild_media_index

### Purpose

Full media-marker resync: every `sql`/`socrata` publication target of the diffusion map is sent to the Bun engine, which regenerates the `.publication` media-marker store.

### Accepts

- No arguments.

### Returns

The rebuild outcome from `rebuildMediaIndex()` (`src/core/diffusion_bridge/diffusion_delete.ts`).

### Usage

**Global-admin only** — a cross-section operation.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "rebuild_media_index"
}
```
