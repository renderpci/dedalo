# dd_utils_api

Overview

- Utility API for system operations: authentication, file uploads, system info, and process management.

How to call

- POST JSON to `/core/api/v1/json/index.php` with `dd_api: "dd_utils_api"` and `action: "<method>"`.
- For file uploads, use multipart/form-data with the JSON in the request body and files in `$_FILES`.

Notes

- `login` and `quit` are entry points for session management.
- `upload` and related methods handle file ingestion; they require server-side directory configuration.

## login

### Purpose

Authenticate user with username and password.

### Accepts

- `options`: object (required)
  - `username`: string (required) — user login name
  - `auth`: string (required) — user password

### Returns

`{ result: true|false, msg: string, user_id: number, user_name: string, session_id: string }`

### Usage

Validates credentials against the user database. On success, session is established.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "login",
  "options": {
    "username": "admin",
    "auth": "password123"
  }
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK",
  "user_id": 1,
  "user_name": "admin",
  "session_id": "sess_abc123xyz"
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

Invalidates session and closes user's connection to the system.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "quit",
  "options": {}
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK. Session terminated"
}
```

## upload

### Purpose

Upload a file to server.

### Accepts

- `options`: object (required)
  - `file_to_upload` or `file` or `upload`: object (required) — PHP $_FILES entry
    - `name`: string — original filename
    - `type`: string — MIME type
    - `tmp_name`: string — temporary file path
    - `error`: int — upload error code (0 = success)
    - `size`: int — file size in bytes
  - `key_dir`: string (required) — upload directory key (e.g., "media/upload", "tool_upload")
  - `tipo`: string (optional) — media type descriptor (if media upload)
  - `chunked`: boolean|string (optional) — whether this is part of a chunked upload

### Returns

`{ result: true|false, msg: string, file_info: { name, size, path } }`

### Usage

Handles single and chunked file uploads. Validates file type and size. Integrates with media engine for processing.

### Example Request

Multipart/form-data:

```
dd_api: "dd_utils_api"
action: "upload"
options: {"key_dir": "media/upload", "tipo": null, "chunked": false}
[File in \$_FILES['file_to_upload']]
```

### Example Response

```json
{
  "result": true,
  "msg": "OK. File uploaded",
  "file_info": {
    "name": "image.jpg",
    "size": 102400,
    "path": "/media/upload/image.jpg"
  }
}
```

## list_uploaded_files

### Purpose

List files in upload directory.

### Accepts

- `options`: object (required)
  - `key_dir`: string (required) — directory key to list (e.g., "media/upload")

### Returns

`{ result: [{ name, size, date, path }], msg: string }`

### Usage

Returns array of files currently in the specified upload directory.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "list_uploaded_files",
  "options": {
    "key_dir": "media/upload"
  }
}
```

### Example Response

```json
{
  "result": [
    {
      "name": "image1.jpg",
      "size": 102400,
      "date": "2024-01-15",
      "path": "/media/upload/image1.jpg"
    },
    {
      "name": "image2.png",
      "size": 204800,
      "date": "2024-01-14",
      "path": "/media/upload/image2.png"
    }
  ],
  "msg": "OK"
}
```

## get_system_info

### Purpose

Retrieve system and server information.

### Accepts

- `options`: object (optional) — typically empty

### Returns

`{ result: { php_version, postgresql_version, disk_space, memory, ... }, msg: string }`

### Usage

Returns diagnostic information useful for admin dashboard or system health checks.

### Example Request

```json
{
  "dd_api": "dd_utils_api",
  "action": "get_system_info",
  "options": {}
}
```

### Example Response

```json
{
  "result": {
    "php_version": "8.3.0",
    "postgresql_version": "16.0",
    "disk_space_free": "500GB",
    "memory_limit": "2GB",
    "max_upload_size": "500MB"
  },
  "msg": "OK"
}
```
