# dd_ts_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md) · [dispatch](dispatch.md)

Thesaurus / hierarchical-tree API: read a node and its children, add a child, move a node to another parent, and reorder siblings.

Registered actions (`src/core/api/handlers/dd_ts_api.ts`): `get_node_data`, `get_children_data`, `add_child`, `update_parent_data`, `save_order`. The handlers are thin wrappers over `src/core/ts_object/ts_api.ts`, which owns the permission gates and every refusal.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_ts_api"` and `action` set to one of the five.
- Every action requires a session and passes the dispatcher's CSRF gate.

## Common contract

- **`section_id` is an int.** Every `section_id` in this API's body addresses a tree node, i.e. a matrix record, and is canonicalized at one door. A legacy numeric string still coerces (counted, deprecated); anything that is not an address — a synthetic token, a zero-padded external id — refuses as `section_id.not_an_address`.
- **Permission** is the section grant on `source.section_tipo`: reads need level ≥ 1, writes level ≥ 2.
- **Envelope v2.** Success is `{ ok: true, request_id, data, … }`; the payload the tree client consumes is `data`. A refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }` carrying the registry's HTTP status — a failure is no longer an HTTP-200 body with `result: false`, and there is no `result` key (the v1 `{ result, msg, errors }` shape was removed on 2026-08-16).
- **Non-fatal findings** ride as the top-level `errors` extension key (an incomplete `section_map`, for instance). An empty set emits no key at all. A warning never becomes a refusal: `add_child` still creates the node.

### Errors

| code | when |
| --- | --- |
| `request.invalid_source` | the RQO carries no `source`. |
| `section_id.not_an_address` | a `section_id` in the body is not a record address. |
| `perm.denied` | section permission below the action's level. |
| `tree.parent_unresolved` | the section has no `component_relation_parent` to hang the node from. |
| `tree.cycle` | `update_parent_data` would make a node its own ancestor (self-target included). |
| `tree.node_write_failed` | the mutation's transaction rolled back; nothing was written. |
| `request.invalid_options` | `save_order` without `parent_section_tipo` / `parent_section_id`. |
| `resource.conflict` | `save_order` on a section whose `section_map` declares no `order` key — there is no column to write the sequence into. |

!!! note
    The examples use the `monedaiberica` install: `es1` is a tree section (a virtual section of the core **Thesaurus** section `hierarchy20`) and `hierarchy36` is its `component_relation_parent` ("Dependent of"). Another install's tree sections differ; the core `hierarchy*` tipos do not.

## get_node_data

### Purpose

Return the parsed node data for one tree node.

### Accepts

- `source`: object (required)
    - `section_tipo`: string — the tree section.
    - `section_id`: int (optional) — the node.
    - `children_tipo`: string (optional) — the relation component the node hangs from.
    - `area_model`: string (optional, default `"area_thesaurus"`).
- `options.thesaurus_view_mode`: string (optional) — `default` or `model`.

### Returns

`data` is the parsed node-data object built by the node builder in `src/core/ts_object/`, or `null` when nothing resolves.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_node_data",
  "source": { "section_tipo": "es1", "section_id": 13919 },
  "options": {}
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee50",
  "data": { "section_tipo": "es1", "section_id": 13919, "label": "…", "ar_children": [] }
}
```

## get_children_data

### Purpose

List the children of a node — or parse a pre-built list of child locators.

### Accepts

- `source`: object (required)
    - `section_tipo`: string, `section_id`: int (optional) — the parent node.
    - `children_tipo`: string (optional) — the child relation component. With `section_id` and no explicit `children`, this is the standard resolution path (default limit 300).
    - `children`: array of locator objects (optional) — a pre-built child list to parse instead.
    - `model`: string (optional, default `"area_thesaurus"`) — the area model.
- `options.pagination`: object (optional) — `limit`, `offset`, `total`.
- `options.thesaurus_view_mode`: string (optional).

### Returns

`data` is `{ ar_children_data: [ … ], pagination }`.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_children_data",
  "source": { "section_tipo": "es1", "section_id": 13919, "children_tipo": "hierarchy36" },
  "options": { "pagination": { "limit": 50, "offset": 0 } }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee51",
  "data": {
    "ar_children_data": [],
    "pagination": { "limit": 50, "offset": 0, "total": 0 }
  }
}
```

## add_child

### Purpose

Create a new node under a parent.

### Accepts

- `source`: object (required)
    - `section_tipo`: string (required) — the tree section the child is created in.
    - `section_id`: int (required) — the **parent** node.

### Returns

`data` is the new node's `section_id` (int). Validation runs before any write, so there is no orphan window; the node lock and the whole creation ride one transaction.

An incomplete `section_map` (a missing `thesaurus.is_descriptor` / `is_indexable`) is **non-fatal**: the child is created and the finding travels back in the `errors` extension key.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "add_child",
  "source": { "section_tipo": "es1", "section_id": 13919 }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee52",
  "data": 69150
}
```

## update_parent_data

### Purpose

Move a node from one parent to another.

### Accepts

- `source`: object (required) — `section_tipo`, `section_id`, `old_parent_section_tipo`, `old_parent_section_id`, `new_parent_section_tipo`, `new_parent_section_id`. Every id is an int.

### Returns

`data` is `true`.

!!! warning
    A cycle is refused **before** any mutation: moving a node onto itself, or onto one of its own descendants, answers `tree.cycle` and nothing is written.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "update_parent_data",
  "source": {
    "section_tipo": "es1",
    "section_id": 52661,
    "old_parent_section_tipo": "es1",
    "old_parent_section_id": 13919,
    "new_parent_section_tipo": "es1",
    "new_parent_section_id": 13920
  }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee53",
  "data": true
}
```

## save_order

### Purpose

Write the sibling order of a parent's children.

### Accepts

- `source`: object (required)
    - `section_tipo`: string (required) — the children's section.
    - `ar_locators`: array (required) — the siblings **in their new order**, each `{ section_tipo, section_id }`. The order value is the position in this array; there is no `order` key on a locator.
    - `parent_section_tipo`: string (required) and `parent_section_id`: int (required) — the parent whose children are being ordered. Both are mandatory: without them the write has no node to lock and no relation to resolve.

### Returns

`data` is the list of changes actually written, each `{ value, locator }` — a sibling already at its target position is skipped. The new sequence is mirrored into the ontology's `order_number` afterwards.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "save_order",
  "source": {
    "section_tipo": "es1",
    "parent_section_tipo": "es1",
    "parent_section_id": 13919,
    "ar_locators": [
      { "section_tipo": "es1", "section_id": 52663 },
      { "section_tipo": "es1", "section_id": 52661 }
    ]
  }
}
```

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee54",
  "data": [
    { "value": 1, "locator": { "section_tipo": "es1", "section_id": 52663 } },
    { "value": 2, "locator": { "section_tipo": "es1", "section_id": 52661 } }
  ]
}
```
