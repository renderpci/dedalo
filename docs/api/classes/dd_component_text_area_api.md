# dd_component_text_area_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

API for the text area component (tags and related features).

> **Not yet ported.** `dd_component_text_area_api` is **not registered** in the TS action registry (`src/core/api/dispatch.ts`) — neither `delete_tag` nor `get_tags_info` is callable as an API action in the TS server. Read-time tag resolution is served through the section read pipeline instead (`src/core/section/media_features.ts`; the transcription `tags` info-widget lives at `src/core/components/component_info/widgets/oh/tags.ts`). This page documents the PHP contract for reference; treat it as a gap until the actions land (see `rewrite/STATUS.md`).

## How to call (PHP contract — not registered in TS)

- POST JSON with `dd_api: "dd_component_text_area_api"` and `action` set to `delete_tag` or `get_tags_info`.

## Common fields

- `source` includes the component identifiers; `options` may carry tag or pagination parameters.

## delete_tag

- **Purpose:** Remove an associated tag from a given component instance (removes tag across all languages for that component).
- **Accepts:** `source.section_tipo`, `source.section_id`, `source.tipo`, optional `source.lang`; `options.tag_id` (string) and `options.type` (string, e.g. `index`).
- **Returns:** boolean `response.result` (`true` when one or more tags were removed); `msg` contains details and deleted langs list; `errors` holds errors if any.

### Example Request: delete_tag

```json
{
  "dd_api": "dd_component_text_area_api",
  "action": "delete_tag",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2", "lang": "lg-spa" },
  "options": { "tag_id": "5", "type": "index" }
}

```

### Example Response: delete_tag

```json
{
  "result": true,
  "msg": ["Deleted tag: 5 (index) in 2 langs: [\"lg-spa\",\"lg-eng\"] (model - rsc36)"],
  "errors": []
}

```

## get_tags_info

- **Purpose:** Return tags and tag metadata for a component (used by tag selectors/autocomplete).
- **Accepts:** `source.section_tipo`, `source.section_id`, `source.tipo`, optional `source.lang`; `options.ar_type` (array of types, e.g. `['index','note','person']`).
- **Returns:** object `result` with requested tag lists (e.g. `tags_index`, `tags_persons`, `tags_notes`) depending on `options.ar_type` and component properties.

### Example Request: get_tags_info

```json
{
  "dd_api": "dd_component_text_area_api",
  "action": "get_tags_info",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2", "lang": "lg-spa" },
  "options": { "ar_type": ["index","person"] }
}

```

### Example Response: get_tags_info

```json
{
  "result": {
    "tags_index": [ { "id": "1", "term": "ceramics" } ],
    "tags_persons": [],
    "tags_notes": []
  },
  "msg": [],
  "errors": []
}
```
