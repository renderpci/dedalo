# component_svg

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": false,
    "is_related": false,
    "is_media": true,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine", 
        "tool_upload"
    ],
    "render_views" :[
        {
            "view"    : "mini | default",
            "mode"    : "edit | list"
        }
    ],
    "data": "array",
    "sample_data": [
        {
            "id": 1,
            "files_info": [
                {
                    "quality": "original",
                    "extension": "svg",
                    "file_name": "rsc855_rsc302_1.svg",
                    "file_path": "/svg/original/0/rsc855_rsc302_1.svg",
                    "file_size": 38481,
                    "file_time": { "timestamp": "2025-11-29 10:26:59" },
                    "file_exist": true
                },
                {
                    "quality": "web",
                    "extension": "svg",
                    "file_name": "rsc855_rsc302_1.svg",
                    "file_path": "/svg/web/0/rsc855_rsc302_1.svg",
                    "file_exist": true
                },
                {
                    "quality": "thumb",
                    "extension": "jpg",
                    "file_name": "rsc855_rsc302_1.jpg",
                    "file_path": "/svg/thumb/0/rsc855_rsc302_1.jpg",
                    "file_exist": true
                }
            ],
            "original_file_name": "my_drawing.svg",
            "original_upload_date": "2025-11-29 10:26:59",
            "original_normalized_name": "rsc855_rsc302_1.svg"
        }
    ],
    "value": "string (url) | string (svg content)",
    "sample_value": "/svg/original/0/rsc855_rsc302_1.svg"
}
```

## Definition

Component SVG manages Scalable Vector Graphics files. It handles the upload, storage, and versioning of SVG files, including generating thumbnails for preview. Unlike typical image components, it can also provide the raw XML content of the SVG for inline embedding.

## Data model

**Data:** `array` of objects (usually one object for single-file components, but structure allows defined multiple).

**Storage:** In database, `component_svg` saves data as a JSON array containing file metadata and quality variants.

**Properties:**

TODO

## Qualities

The component typically manages three qualities:

1.  **original**: The exact file uploaded by the user, stored without modification.
2.  **web**: A version optimized for web display (often identical to original for SVGs).
3.  **thumb**: A raster image (JPG) generated from the SVG for use in list views or where SVG rendering is not required/supported.

## Methods

### `get_url`

**Signature:**
`get_url( ?string $quality=null, bool $test_file=false, bool $absolute=false, bool $default_add=true ) : ?string`

Get the URL for the component's file.

- **Parameters:**
    - `$quality`: (string, optional) The quality version to retrieve (e.g., 'original', 'web', 'thumb'). Defaults to the component's configured default quality.
    - `$test_file`: (bool, default `false`) If `true`, checks if the file physically exists on the server. If missing, may return a fallback or null depending on configuration.
    - `$absolute`: (bool, default `false`) If `true`, returns an absolute URL (including domain); otherwise, returns a relative path suitable for `src` attributes.
    - `$default_add`: (bool, default `true`) Whether to append default parameters or fallback logic if the specific quality is missing.

- **Return:**
    - `string|null`: The URL of the file, or `null` if not found/available.

---

### `get_file_content`

**Signature:**
`get_file_content() : ?string`

Retrieves the raw content of the SVG file as a string.

- **Use Case:**
    - Ideally used when you need to embed the SVG inline in the HTML page to manipulate its DOM (CSS valid structure, filling paths, animating elements) rather than displaying it as an `<img>` tag.

- **Return:**
    - `string|null`: The actual XML/SVG content of the file.

---

### `create_thumb`

**Signature:**
`create_thumb() : bool`

Generates a raster thumbnail (JPG) from the original SVG file.

- **Logic:**
    - Uses system commands (e.g., Ghostsript or ImageMagick) to convert the vector data into a pixel-based image.
    - Useful for media lists, previews, or devices/contexts where simplified images are preferred over complex vector rendering.

- **Return:**
    - `bool`: `true` on success, `false` on failure.

---

### `process_uploaded_file`

**Signature:**
`process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object`

Handles the post-upload processing logic. This is the entry point for turning a raw uploaded file into a managed component resource.

- **Parameters:**
    - `$file_data`: (object, optional) Metadata about the uploaded file (temp path, name, etc.).
    - `$process_options`: (object, optional) Configuration for the processing (e.g., whether to auto-generate thumbnails).

- **Return:**
    - `object`: The result object containing the processed file paths and metadata.

---

### `update_data_version`

**Signature:**
`update_data_version( object $options ) : object`

Updates the data structure of the component to match a new system version.

- **Parameters:**
    - `$options`: (object) Contains `update_version` (target version), `data_unchanged` (current data), and `reference_id`.

- **Return:**
    - `object $response`:
        - `result = 0`: Component does not support/have this function.
        - `result = 1`: Update performed successfully.
        - `result = 2`: Update attempted but data didn't need changes.

## Import model

To import data, you can provide the array structure matching `files_info`. However, simpler imports might just specify the source file, letting the system handle processing if configured.

Typical import structure (advanced):
```json
[{
    "original_file_name": "icon.svg",
    "original_upload_date": "2025-01-01 12:00:00",
    "files_info": [ ... ]
}]
```
