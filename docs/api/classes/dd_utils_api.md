# dd_utils_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [RQO field mapping](../RQO_FIELD_MAPPING.md) · [dd_core_api](dd_core_api.md)

Utility API for system operations: authentication, language, system info, and upload assembly.

Registered actions (`src/core/api/dispatch.ts`): `login`, `quit`, `get_login_context`, `get_install_context`, `get_system_info`, `change_lang`, `convert_search_object_to_sql_query`, `join_chunked_files_uploaded`, `list_uploaded_files`, `update_lock_components_state`, `get_lock_status`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_utils_api"` and `action: "<method>"`.
- Multipart file uploads are **not** a JSON-dispatched action here — they are handled by the media ingest branch of the API path in `src/server.ts`.

## Notes

- `login` and `quit` are the entry points for session management (native TS auth: Argon2id via `Bun.password`, rotating server-side sessions — not PHP-session-compatible).
- `join_chunked_files_uploaded` reassembles a completed chunked upload; `get_system_info` is the pre-transfer init call the client makes before uploading.

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

Validates credentials and, on success, creates a rotating server-side session. The session token is set as an HTTP cookie on the response (there is no PHP-style `session_id` in the body); the fresh `csrf_token` ships in the body so the next non-exempt action can succeed. `login` is a `NO_LOGIN` / CSRF-exempt action.

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

In the TS server `upload` is **not** a JSON-dispatched action. Multipart uploads (single or chunked) hit the media ingest branch of the API path in `src/server.ts`, which routes the form data into `src/core/media/ingest/upload.ts`. Once all chunks have arrived the client fires a JSON `join_chunked_files_uploaded` RQO (below) to reassemble and re-sniff them.

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

`{ result: [{ url, name, size }], msg: string }`. Registered but currently returns an empty array (the common boot state; the full temp-dir scan is uncovered scope — see `rewrite/STATUS.md`).

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

`{ result: SystemInfo, msg: string }`. The payload (`src/core/resolve/system_info.ts`) is the upload-limit negotiation the client reads before it can transfer a file. There is no `php.ini`; the numbers come from the media/upload config catalog. Shape: `{ max_size_bytes, sys_get_temp_dir, upload_tmp_dir, upload_tmp_perms, session_cache_expire, upload_service_chunk_files, pdf_ocr_engine }`.

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
