# dd_component_portal_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [component_portal](../../core/components/component_portal.md) · [dispatch](dispatch.md)

Bulk **locator removal** from a relation component: unlink every stored locator that matches a partial locator on the named properties.

Registered actions (`src/core/api/handlers/dd_component_portal_api.ts`): `delete_locator`.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_component_portal_api"` and `action: "delete_locator"`.
- The component coordinates ride in `rqo.source`; the match criteria ride in `rqo.options`.
- The action requires a session and is CSRF-gated — it is a record write.

## delete_locator

### Purpose

Remove matching locators from a relation component's stored data. This is the second half of the tag-removal flow: [`dd_component_text_area_api::delete_tag`](dd_component_text_area_api.md) strips the marks from the transcription text, and this call removes the tag's locator from the indexation component.

### Accepts

- `source`: object (required)
    - `section_tipo`: string (required) — the host record's section.
    - `section_id`: int (required) — the host record. It is a matrix record address and is canonicalized at this door; a legacy numeric string still coerces (counted, deprecated), and a non-address value is refused.
    - `tipo`: string (required) — the relation component holding the locators.
- `options.locator`: object (required) — a full or partial locator to match, e.g. `{ "tag_id": "1", "type": "dd96" }`.
- `options.ar_properties`: array of string (optional) — the property names to compare on. Omitted or empty means a strict compare over the **union** of the properties present on both sides, not a four-field default.

### Authorization

The write door, in one order, before anything is read, locked or written:

1. **Section**: permission level ≥ 2 on `source.section_tipo`, which caps consultation-only sections at read.
2. **Field**: permission level ≥ 2 on the (`section_tipo`, `tipo`) pair. A user manager cannot unlink their own profile, active or administrator flag (the own-record rule of `dd128`).
3. **Record**: the record must be in the caller's projects. A `section_id` of 0 or below is refused for every caller, administrators included.

Only an authorized caller has `options.locator` validated. Each removed locator also strips its paired dataframe entries, and a slot whose policy deletes the frame's target record asks write access on that target section too.

!!! note
    This door asks section level 2; [`delete_tag`](dd_component_text_area_api.md#delete_tag), the text-mark half of "delete index", asks the field and the record but no section level. A profile that can edit the transcription field but only read the section gets its marks removed and the locator refused, so the locator is left behind. See `engineering/wire_contract/WC-2026-10-01-delete-locator-write-door.md`.

### Returns

`{ ok: true, data: <int>, msg: [ … ] }`.

- `data` — how many locators were removed (`0` when none matched). Zero is a **success**, not an error.
- `msg` — an array of operator narrative lines, riding as an extension key.

Envelope: **v2**. A refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }`. There is no `result` key — the v1 `{ result, msg, errors }` shape was removed on 2026-08-16.

### Errors

| code | when |
| --- | --- |
| `section_id.not_an_address` | `source.section_id` is present but is not a record address. |
| `request.invalid_options` | `section_tipo`, `tipo` or `section_id` missing; or, once the caller is authorized, `options.locator` missing or not an object. |
| `request.invalid` | `section_tipo` or `tipo` is not a valid identifier. |
| `perm.denied` | section permission level < 2, or (`section_tipo`, `tipo`) permission level < 2 (own-record aware). |
| `perm.out_of_scope` | the record is outside the caller's projects, or `section_id` is 0 or below (every caller). |

### Example request

```json
{
  "dd_api": "dd_component_portal_api",
  "action": "delete_locator",
  "source": { "section_tipo": "rsc167", "section_id": 528, "tipo": "rsc860" },
  "options": { "locator": { "tag_id": "1", "type": "dd96" }, "ar_properties": ["tag_id", "type"] }
}
```

!!! note
    On the `monedaiberica` install `rsc860` is the `component_autocomplete_hi` that holds the transcription's index locators inside the **Audiovisual** section `rsc167`, and `dd96` is the `relation_type` "Indexation". `component_autocomplete` and `component_autocomplete_hi` are portal-family relation components and are served by this action like any other. Another install's tipos differ.

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee30",
  "data": 1,
  "msg": ["Deleted 1 locator (rsc860)"]
}
```
