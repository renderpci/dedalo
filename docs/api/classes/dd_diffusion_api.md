# dd_diffusion_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [The diffusion engine](../../diffusion/native_engine.md) · [dispatch](dispatch.md)

Publication / diffusion control plane: launch a rebuild, follow or cancel a running process, read diffusion info and engine advisories, and run the admin resync operations. The copied `tool_diffusion` client reaches these through its main-API fallback; the actions are served natively by the core dispatcher (jobs + spawned runner processes).

Registered actions (`src/core/api/handlers/dd_diffusion_api.ts`): `diffuse`, `get_process_status`, `list_processes`, `cancel_process`, `get_diffusion_info`, `get_engine_advisory`, `follow_queue`, `retry_pending_deletions`, `sweep_published_langs`, `validate`, `rebuild_media_index`. The handlers delegate to the diffusion action facade (`src/diffusion/api/actions.ts`); wire shapes are pinned in `test/parity/fixtures/diffusion/pinned.ts`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_diffusion_api"` and `action: "<method>"`.

## Notes

- Every action requires a session (none is in `NO_LOGIN_ACTIONS`) and, being state-changing or job-driving, passes the dispatcher's CSRF gate.
- `follow_queue`, `retry_pending_deletions`, `sweep_published_langs`, `validate` and `rebuild_media_index` are **global-admin only** — cross-section background operations a non-admin must not be able to trigger. An unauthorized caller gets `perm.denied` (HTTP 403). `follow_queue` is the one exception in *form*: it is a stream, and a stream client cannot receive a JSON refusal, so its refusal is an SSE frame.
- `diffuse`, `get_process_status` and `follow_queue` return **SSE streams**, not a single JSON body; `get_process_status` and `list_processes` are owner-scoped (the client-supplied `process_id` is guessable, so a process streams only to its owner), while `follow_queue` names every owner's job — which is exactly why it is admin-only.
- Envelope for the non-stream actions: **v2**. Success is `{ ok: true, request_id, data, … }`; a refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }` with the registry's HTTP status. There is no `result` key — the v1 `{ result, msg, errors }` shape was removed on 2026-08-16.

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

An SSE stream of progress frames following the launched job (or attaching to the run already active for the same element + section).

A missing `sqo.section_tipo` or `options.diffusion_element_tipo` refuses with `request.invalid_options`; read permission below level 1 on the source section with `perm.denied`. When the deployment pins a native-element list, an element outside it refuses **loudly** with `engine.uncovered_scope` rather than publishing through the other engine as well.

!!! note
    The job spec is **server-authoritative** for the publication scope, not just for the SQO. A non-admin's `skip_publication_state_check` is stripped (a read-level caller can never publish embargoed or draft records), and `levels` is clamped to the configured server ceiling, so a one-record run cannot be expanded into a transitive publication of the relation graph.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "diffuse",
  "options": {
    "diffusion_element_tipo": "dd1099",
    "process_id": "process_diffusion_1_dd1099_oh1",
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

An SSE stream of progress frames. Owner-scoped: a process streams only to the user that launched it. A missing or malformed `process_id` yields a single terminal SSE frame carrying `is_running: false` and `errors: ["process_id is required"]` — not a JSON refusal, because the caller is already reading a stream. `update_rate` is clamped to 250–10000 ms.

## list_processes

### Purpose

List the caller's recent diffusion processes.

### Accepts

- No arguments.

### Returns

`{ ok: true, request_id, data: { processes: [ <progress_data> ] } }` — the caller's own processes within the recent (24 h) window.

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

`{ ok: true, request_id, data: { cancelled: <bool>, message: <string> } }`. A cancel that finds nothing is **not** a failed request — the caller asked for the process to stop and it is stopped; `cancelled` says whether *this* call is what stopped it, which is what the panel renders. A missing or malformed `process_id` refuses with `diffusion.invalid_process_id`.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "cancel_process",
  "process_id": "process_diffusion_1_dd1099_oh1"
}
```

## get_diffusion_info

### Purpose

Return diffusion configuration/status info for a section.

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required)

### Returns

`{ ok: true, request_id, data: <info> }` — the panel descriptors for that section. A missing `options.section_tipo` refuses with `request.invalid_options`; read permission below level 1 on the section with `perm.denied`.

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

`{ ok: true, request_id, data: { state, title, checks } }`, tailored to whether the caller is a global admin.

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

`{ ok: true, request_id, data: { summary: "Retried <n> of <m> pending deletions (<k> remaining)", retried, total, remaining } }`.

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

`{ ok: true, request_id, data: { result: <plan|null>, errors, warnings, degradations } }` — a compile that fails is a **report** here, not a refusal, so the errors it found are the payload. (The `result` inside `data` is the compiled plan; it is a field of the payload, not the retired envelope key.) A missing `options.diffusion_element_tipo` refuses with `request.invalid_options`.

### Usage

**Global-admin only.**

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "validate",
  "options": { "diffusion_element_tipo": "dd1099" }
}
```

## rebuild_media_index

### Purpose

Full media-marker resync: every `sql`/`socrata` publication target of the diffusion map is sent to the Bun engine, which regenerates the `.publication` media-marker store.

### Accepts

- No arguments.

### Returns

`{ ok: true, request_id, data: <report> }` — the outcome of `rebuildMediaIndex()` (`src/core/diffusion_bridge/diffusion_delete.ts`). The rebuild answers a report and **throws** on failure; there is no falsy-success shape.

### Usage

**Global-admin only** — a cross-section operation.

### Example Request

```json
{
  "dd_api": "dd_diffusion_api",
  "action": "rebuild_media_index"
}
```

## follow_queue

### Purpose

Follow the whole diffusion queue — every owner's running job — as an SSE stream.

### Accepts

- No arguments.

### Usage

**Global-admin only**, and more sensitive than its owner-scoped siblings: every frame names jobs the owner scope deliberately withholds from `get_process_status` / `list_processes`. The gate runs before any queue is opened or read, and the refusal is delivered as an SSE frame rather than a JSON envelope, because a stream client cannot consume one.

## sweep_published_langs

### Purpose

Audit — and, on demand, repair — the published languages of the publication targets.

### Accepts

- `options`: object (optional)
    - `mode`: string (optional, default `"report"`) — `report` is read-only; `sweep` deletes rows.
    - `langs`: array of non-empty strings (required in `sweep` mode) — the languages whose rows are to be removed.
    - `databases`: array of non-empty strings (optional) — restrict the scope to named targets.
    - `confirm`: boolean — must be exactly `true` for `sweep`.

A non-array, or an array containing a non-string or an empty string, is **refused loudly** (`request.invalid_options`) rather than filtered: silently dropping an entry would make the sweep act on a list the caller never sent, and for `databases` it would widen the scope from "these two" to "every target".

### Returns

`{ ok: true, request_id, data: { mode, … } }` — the audit in `report` mode (the policy, every published language, and the phantom ones with their row counts), the removal outcome in `sweep` mode.

### Usage

**Global-admin only**, gated both at the dispatcher and inside the action — a wiring mistake must not be able to remove a permission check. Report-before-remove is a contract, not a UI convention: `sweep` without `confirm: true` and without an explicit `langs` list is refused.
