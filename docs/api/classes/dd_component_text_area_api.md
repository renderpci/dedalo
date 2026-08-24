# dd_component_text_area_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [component_text_area](../../core/components/component_text_area.md) · [dispatch](dispatch.md)

Transcription **tags**: resolve the marks a transcription carries into the records they point at, and delete one tag from every language of the text.

Registered actions (`src/core/api/handlers/dd_component_text_area_api.ts`): `get_tags_info`, `delete_tag`.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_component_text_area_api"` and `action` set to one of the two.
- The **record coordinates** ride in `rqo.source` (`tipo` = the `component_text_area` node, plus `section_tipo` / `section_id`); everything else rides in `rqo.options`.

## Notes

- Both actions require a **session** and are **CSRF-gated** by the dispatcher; neither is in the no-login set.
- A transcription's stored text carries only tag **marks** — `[index-n-58-…]`, `[note-a-3-data:{…}:data]`. What a mark *means* lives in other records, so a consumer asks `get_tags_info` **once** and resolves every mark locally instead of one request per mark.
- Which tag families a text area has at all is declared in its own ontology `properties`: `tags_index`, `tags_reference`, `tags_notes`, `tags_persons`. A family the node does not declare is simply **absent** from the answer — never an error, never an empty key.
- `section_id` is an int on the wire: every locator's `section_id` is canonicalized on the way out, whichever form the stored row happens to hold (an external remote id such as `"001338683"` survives verbatim). Every OTHER stored key travels as it is stored, `section_top_id` included — hence the mixed forms in the sample below. `tag_id` is **not** an address and deliberately stays a **string**: it is a token matched against text captured out of the transcription.
- Envelope: **v2**. Success is `{ ok: true, request_id, data, … }`; a refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }`.

## get_tags_info

### Purpose

Resolve the requested tag families of one transcription into their labels and linked records — the feed `tool_tr_print` reads to lay a transcription out for print.

### Accepts

- `source`: object (required)
    - `tipo`: string (required) — the `component_text_area` node.
    - `section_tipo`: string (required), `section_id`: int (required) — the host record.
    - `lang`: string (optional) — the transcription language; defaults to the request's data lang.
- `options.ar_type`: array of string (required, non-empty) — any of `index`, `reference`, `note`, `person`.

### Authorization

Read access to the **host record** is checked before anything is resolved (the principal must pass the record-scope gate for `section_tipo` / `section_id`) — this feed quotes the content of that record *and* of every record its tags point at.

### Returns

`{ ok: true, data: { tags_index?, tags_reference?, tags_notes?, tags_persons? }, unknown_types: [] }`.

- `tags_index` / `tags_reference` — `[{ data: <locator>, label }]`, the stored tag locator plus its resolved term label (`label` is `null` when the term does not resolve).
- `tags_notes` — `[{ data: <locator>, <ddo id>: value, … }]`, one key per entry of `properties.tags_notes` (`title`, `body`, `publishable`…).
- `tags_persons` — the persons feed, grouped as the edit view builds it.
- `unknown_types` — an extension key listing the requested types the engine does not know. Never silently dropped.

### Errors

| code | when |
| --- | --- |
| `request.invalid_source` | `tipo` / `section_tipo` / `section_id` missing, or `section_id` is not a record address. |
| `request.invalid_options` | `ar_type` absent or not a non-empty array of strings. |
| `perm.denied` | the caller may not read the host record. |

### Example request

```json
{
  "dd_api": "dd_component_text_area_api",
  "action": "get_tags_info",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": 528 },
  "options": { "ar_type": ["index", "reference", "note"] }
}
```

!!! note
    `rsc36` is the transcription `component_text_area` of the `monedaiberica` install; it declares `tags_index` (`rsc860`), `tags_reference` (`rsc1368`) and `tags_notes` (`rsc326`). `rsc167` is a virtual section of `rsc2`. Another install's tipos differ — read the text area's own `properties` to know which families it has.

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee00",
  "data": {
    "tags_index": [
      {
        "data": {
          "id": 2,
          "type": "dd96",
          "tag_id": "1",
          "section_tipo": "on1",
          "section_id": 5,
          "section_top_tipo": "oh1",
          "section_top_id": "368",
          "tag_component_tipo": "rsc36",
          "from_component_tipo": "rsc860"
        },
        "label": "Hasdrubal"
      }
    ]
  },
  "unknown_types": []
}
```

## delete_tag

### Purpose

Remove one tag's marks from the transcription — in **every** language of the text, not just the one on screen.

### Accepts

- `source`: object (required) — `tipo`, `section_tipo`, `section_id` (a positive int).
- `options.tag_id`: string (required) — the tag's in-text id (1–6 digits).
- `options.type`: string (required) — `index` or `reference`. Those are the only mark families paired by id; any other value is refused rather than treated as a no-op.

### Authorization

The canonical write gate, identical to a component save: permission level **≥ 2** on the (`section_tipo`, `tipo`) pair, then — for a non-admin — the per-record projects scope. A level-2 user must not rewrite a record they cannot see.

### Returns

`{ ok: true, data: <boolean>, langs_changed: [], removed_count: 0 }`.

!!! warning
    `data` is `false` when nothing matched, and that falsiness is **load-bearing**: the editor removes its own tag markup only when the answer is not false. "Nothing matched" is a falsy **success**, never an error — re-issuing the request is safe.

- `langs_changed` — the languages whose text was rewritten (extension key).
- `removed_count` — how many marks were removed (extension key).
- A **partial** write (some languages cleaned, one failed) still answers `ok: true` with the languages that did change, plus one coded notice `record.save_failed` in `notices[]`. It is never swallowed and never inflated into a request failure.

### Deleting the whole indexation

This action removes the **marks in the text** only. The tag's locator in the indexation component is a second, deliberate step: the client calls [`dd_component_portal_api::delete_locator`](dd_component_portal_api.md) right after.

### Errors

| code | when |
| --- | --- |
| `request.invalid_source` | `tipo` / `section_tipo` missing, or `section_id` is not a positive int. |
| `request.invalid_options` | `tag_id` empty or malformed, or `type` outside `index` / `reference`. |
| `perm.denied` | permission level < 2 on the component. |
| `perm.out_of_scope` | a non-admin whose projects do not contain the record. |

### Example request

```json
{
  "dd_api": "dd_component_text_area_api",
  "action": "delete_tag",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": 528 },
  "options": { "tag_id": "1", "type": "index" }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee01",
  "data": true,
  "langs_changed": ["lg-spa", "lg-eng"],
  "removed_count": 2
}
```
