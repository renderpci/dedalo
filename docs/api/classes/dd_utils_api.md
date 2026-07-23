# dd_utils_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [RQO field mapping](../RQO_FIELD_MAPPING.md) · [dd_core_api](dd_core_api.md)

Utility API for system operations: authentication, language, system info, and upload assembly.

Registered actions (`src/core/api/dispatch.ts`): `login`, `quit`, `get_login_context`, `get_install_context`, `install`, `request_password_reset`, `confirm_password_reset`, `get_system_info`, `get_dedalo_files`, `change_lang`, `convert_search_object_to_sql_query`, `join_chunked_files_uploaded`, `list_uploaded_files`, `get_job_events`, `get_process_status`, `stop_process`, `update_lock_components_state`, `get_lock_status`, `get_server_ready_status`, `get_ontology_update_info`, `get_code_update_info`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_utils_api"` and `action: "<method>"`.
- Multipart file uploads are **not** a JSON-dispatched action here — they are handled by the media ingest branch of the API path in `src/server.ts`.

## Notes

- `login` and `quit` are the entry points for session management: Argon2id (via `Bun.password`) over rotating, server-side sessions.
- `join_chunked_files_uploaded` reassembles a completed chunked upload; `get_system_info` is the pre-transfer init call the client makes before uploading.
- `get_server_ready_status`, `get_ontology_update_info` and `get_code_update_info` are the master-server surface: remote installations call them without a session to probe reachability and fetch an update manifest. They fail closed unless the host is configured as an ontology or code server.

## login

### Purpose

Authenticate user with username and password.

### Accepts

- `options`: object (required)
  - `username`: string (required) — user login name
  - `auth`: string (required) — user password

### Returns

`{ result: true|false, msg: string, user_id: number, csrf_token: string }`

### Usage

Validates credentials and, on success, creates a rotating server-side session. The session token is set as an HTTP cookie on the response — it is never returned in the body; the fresh `csrf_token` ships in the body so the next non-exempt action can succeed. `login` is a `NO_LOGIN` / CSRF-exempt action.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "login",
  "options": {
    "username": "admin",
    "auth": "secret"
  }
}
```

### Example Response

```json
{
  "result": true,
  "msg": "ok",
  "user_id": 1,
  "csrf_token": "…"
}
```

## quit

### Purpose

Logout current user session.

### Accepts

- `options`: object (optional) — typically empty

### Returns

`{ result: true|false, msg: string }`

### Usage

Destroys the server-side session and clears the session cookie on the response.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "quit"
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK. Request done"
}
```

## upload — handled outside the JSON dispatcher

`upload` is **not** a JSON-dispatched action. Multipart uploads (single or chunked) hit the media ingest branch of the API path in `src/server.ts`, which routes the form data into `src/core/media/ingest/upload.ts`. Once all chunks have arrived the client fires a JSON `join_chunked_files_uploaded` RQO (below) to reassemble and re-sniff them.

## join_chunked_files_uploaded

### Purpose

Reassemble a completed chunked upload (the JSON follow-up to the multipart chunk POSTs).

### Accepts

- `options`: object (required)
  - `file_data`: object — `{ key_dir, tmp_name, total_chunks }`
  - `files_chunked`: array (optional) — the dense chunk list (its length is used as `total_chunks` when present)

### Returns

`{ result: true|false, msg: string, file_data: { key_dir, tmp_name, extension, chunked: false, complete: true } }`. Fail-closed: an anonymous caller gets a 404.

## list_uploaded_files

### Purpose

List files in upload directory.

### Accepts

- `options`: object — no fields are required.

### Returns

`{ result: [{ url, name, size }], msg: string }`. The action is registered and honors that shape, but currently always returns an empty array — the common boot state, where the user has no pending chunked upload.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "list_uploaded_files"
}
```

### Example Response

```json
{
  "result": [],
  "msg": "OK. Request done"
}
```

## get_system_info

### Purpose

Retrieve system and server information.

### Accepts

- `options`: object (optional) — none required.

### Returns

`{ result: SystemInfo, msg: string }`. The payload (`src/core/api/handlers/system_info.ts`) is the upload-limit negotiation the client reads before it can transfer a file. The numbers come from the media/upload config catalog — there is no runtime `.ini` to consult. Shape: `{ max_size_bytes, sys_get_temp_dir, upload_tmp_dir, upload_tmp_perms, session_cache_expire, upload_service_chunk_files, pdf_ocr_engine }`.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "get_system_info"
}
```

### Example Response

```json
{
  "result": {
    "max_size_bytes": 10485760,
    "sys_get_temp_dir": "/tmp",
    "upload_tmp_dir": "/…/media/tmp",
    "upload_tmp_perms": 16877,
    "session_cache_expire": 180,
    "upload_service_chunk_files": 20,
    "pdf_ocr_engine": true
  },
  "msg": "OK. Request done"
}
```

## change_lang

### Purpose

Persist the user's interface and/or data language choice for subsequent requests.

### Accepts

- `options`: object (required)
  - `dedalo_application_lang`: string (optional) — the interface language
  - `dedalo_data_lang`: string (optional) — the data language

At least one must be present. Each value is validated against the language identifier allowlist **before** it is stored (an invalid tag is dropped, never persisted). When the install couples the two languages, a change to either drives the other.

### Returns

`{ result: true|false, msg: string }`. With no valid language supplied, `result` is `false`.

### Usage

State-changing and authenticated (the router already ran the CSRF gate, and the action requires a session). The choice is stored on the server-side session; every later request rebuilds with the stored language (`src/core/resolve/request_lang.ts`). The client posts here, then full-reloads.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "change_lang",
  "options": {
    "dedalo_application_lang": "lg-eng",
    "dedalo_data_lang": "lg-spa"
  }
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK. Request done. Changed dedalo_application_lang to lg-eng, dedalo_data_lang to lg-spa"
}
```

## get_login_context

### Purpose

Return the login form's own structure context.

### Accepts

- No arguments.

### Returns

`{ result: [<login context>], msg: string }`.

### Usage

Pre-auth by design — the form must render before any session exists.

## get_install_context

### Purpose

Return the install wizard's structure context on a fresh, unconfigured machine.

### Accepts

- No arguments.

### Returns

`{ result: [<installer element context>], msg: string }`.

### Usage

On a fresh machine there is no ontology to resolve, so this is a synthetic context built by hand carrying exactly the properties the client's installer reads. The dispatch gate (Gate 1b) admits it only while the server is unsealed **and** the caller IP is allowed; once the install is sealed it 404s.

## install

### Purpose

The install wizard's step router — every wizard step rides this one action.

### Accepts

- `options`: object (required)
  - `action`: string (required) — the concrete wizard step
  - other per-step fields consumed by `src/core/install/engine.ts`

### Returns

The top-level envelope the client reads (`{ result, msg, ... }`), shaped per step.

### Usage

The dispatch gate (Gate 1b) already enforced unsealed + IP-allowed; record-writing steps re-check the session here (login-gated even while unsealed).

## request_password_reset

### Purpose

Forgot-password step 1: request a reset for an identifier.

### Accepts

- `options`: object (required)
  - `identifier`: string (required) — username or email

### Returns

A generic envelope that is identical regardless of whether the identifier exists (anti-enumeration).

### Usage

Pre-auth by design (`NO_LOGIN` + CSRF-exempt). Anti-enumeration and throttling live in `src/core/security/password_reset.ts`.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "request_password_reset",
  "options": {
    "identifier": "admin"
  }
}
```

## confirm_password_reset

### Purpose

Forgot-password step 2: confirm the reset with the emailed code and set a new password.

### Accepts

- `options`: object (required)
  - `reset_id`: string (required)
  - `code`: string (required)
  - `new_password`: string (required)

### Returns

The generic reset envelope (`src/core/security/password_reset.ts`).

### Usage

Pre-auth by design, like `request_password_reset`.

## update_lock_components_state

### Purpose

Record a component soft-lock focus/blur event (the edit-lock mechanism).

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required) — the locked record's section
  - `section_id`: int|string (optional)
  - `component_tipo`: string (optional)
  - `action`: string (optional) — the focus/blur event

### Returns

The lock-state outcome (plus a `dedalo_notification` field).

### Usage

Read permission (level ≥ 1) on the section is required — the gate runs unconditionally and `section_tipo` is mandatory (fail-closed), so a user cannot fabricate focus/blur on records they cannot see. This is the per-component soft-lock, distinct from the area-level `dd_area_maintenance_api::lock_components_actions`.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "update_lock_components_state",
  "options": {
    "section_tipo": "rsc167",
    "section_id": 1,
    "component_tipo": "oh16",
    "action": "lock"
  }
}
```

## get_lock_status

### Purpose

Read-only poll: is the component currently held by another user?

### Accepts

- `options`: object (required)
  - `section_tipo`: string (required)
  - `section_id`: int|string (optional)
  - `component_tipo`: string (optional)

### Returns

The lock-status object for the component.

### Usage

Same fail-closed read gate as `update_lock_components_state` (`section_tipo` required, level ≥ 1 on the section).

## get_dedalo_files

### Purpose

Return the service-worker pre-cache manifest.

### Accepts

- No arguments.

### Returns

`{ result: [...], dedalo_version: string, msg: string }` — the exact shape the client's `sw.js` / `worker_cache.js` read.

### Usage

Authenticated read (a session is required) but CSRF-exempt: the service worker calls it without the page's token.

## get_job_events

### Purpose

Subscribe to a native in-process job and receive every state change as it happens.

### Accepts

- The job handle (`job_id`) the caller is subscribing to.

### Returns

A pushed event stream; the stream ends on the terminal frame, whose `data` is the job's return value (for an import, the full report).

### Usage

Session-gated (`src/core/api/job_stream.ts`). This is the native job-status wire — no `{pid, pfile}` handle and no polling; `get_process_status` below is the legacy poll wire kept for the AV-transcode and backup consumers.

## get_process_status

### Purpose

Stream the status of a background process (media transcode / backup).

### Accepts

- The job identifier the client's `update_process_status` polls.

### Returns

An SSE status stream (`src/core/api/process_status.ts`).

### Usage

Session-gated and **owner-gated** — a job that carries user data streams only to its owner, since the ids are guessable. The legacy poll counterpart to `get_job_events`.

## stop_process

### Purpose

Stop a background job (the generic Stop button's wire).

### Accepts

- The job identifier to abort.

### Returns

The stop outcome (`src/core/api/process_status.ts`).

### Usage

Session-gated and owner-gated. It aborts the job's controller so the handler winds down cooperatively.

## convert_search_object_to_sql_query

### Purpose

The SQO → SQL developer console (the `sqo_test_environment` maintenance widget): translate a client SQO to SQL and run it.

### Accepts

- `options`: object (required) — the client SQO to convert (scrubbed by `sanitizeClientSqo`, the API-boundary security gate).

### Returns

`{ result: true|false, msg: string, sql: string, ar_section_id: array, db_data: array }` — `msg` is the resolved SQL (params substituted, display-only), `sql` is the parameterized template, `ar_section_id` the distinct returned ids, `db_data` the rows. On any error, `result` is `false` and `msg`/`errors` carry the message.

### Usage

**Global-admin only.** The executed query always uses bound params; the substituted `msg` string is for display, never execution.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "convert_search_object_to_sql_query",
  "options": {
    "section_tipo": ["oh1"],
    "limit": 10
  }
}
```

## get_server_ready_status

### Purpose

Remote reachability probe: is this host an available ontology / code master server?

### Accepts

- `options`: object (required)
  - `check`: string (required) — `ontology_server` or `code_server`

### Returns

`{ result: true|false, msg: string, errors: [] }`. `result` is `true` only when the requested check matches a role this host is configured for; otherwise the generic refusal.

### Usage

Machine-to-machine, pre-auth (`NO_LOGIN` + CSRF-exempt). Fail-closed on the configuration flags.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "get_server_ready_status",
  "options": {
    "check": "ontology_server"
  }
}
```

## get_ontology_update_info

### Purpose

Serve an ontology-update manifest to a remote installation.

### Accepts

- `options`: object (required)
  - `version`: string (required) — the caller's `major.minor`
  - `code`: string (required) — a configured access code

### Returns

The update-info manifest when this host is an ontology master and the code/version validate; otherwise `{ result: false, msg, errors }`.

### Usage

Served **only** when this instance is an ontology master, to callers presenting a configured access code. Pre-auth master-server surface.

## get_code_update_info

### Purpose

Serve a code-release manifest to a remote installation.

### Accepts

- `options`: object (required)
  - `version`: string (required) — the caller's version triple
  - `code`: string (required) — a configured `CODE_SERVERS` code

### Returns

`{ result: <manifest>, msg: string, errors: [] }` when this host is a code master and the code/version validate; otherwise `{ result: false, msg, errors }`. It advertises only built release archives on the caller's linear upgrade path.

### Usage

Served **only** when this instance is a code master, to callers presenting a configured code. Pre-auth master-server surface.
