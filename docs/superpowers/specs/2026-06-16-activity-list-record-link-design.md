# Activity list: "Go to record" link — Design

Date: 2026-06-16
Status: Approved (design) — pending implementation

## Problem

In the activity list (section `dd542`, area_activity), each navigation event logs a
DATA field (component `dd551`, `component_json`) whose value is `{ id, msg, tipo }`,
where `id` is the `section_id` of the record the user visited in edit mode and `tipo`
is its `section_tipo`. Today this is displayed as raw JSON. Users want a direct,
clickable way to jump from an activity entry to the exact record it refers to.

(The `id` field itself was only recently populated correctly — see the related fix that
changed `dd_core_api::read()` to read `data[0]->entries[0]->section_id` instead of the
stale `data[0]->value[0]->section_id`.)

## Goal

Render a dedicated "Go to record" link inside the activity list that opens the visited
record in **edit mode** in a **new browser tab**.

## Non-goals

- No SPA in-place navigation (explicitly a new tab).
- No new ontology column / structure data changes.
- No change to what is logged (the DATA value already carries `tipo` + `id`).
- No special handling for deleted records beyond what the edit view already does.

## Approach (approved: Option 1)

Repurpose the existing DATA column (`dd551`) by giving `component_json` a dedicated
**view** that renders a link instead of the raw JSON, scoped to the activity component.

### Why this approach

- Columns are ontology-driven (derived from the section `context` / `columns_map`), so a
  truly new column would require editing installed `dd542` ontology data. The dedicated
  view is code-only.
- The DATA value shape `{ id, msg, tipo }` is the activity signature; routing by the
  component tipo `dd551` keeps the change scoped and leaves every other `component_json`
  instance untouched (the default view still opens its JSON-editor modal).

### Deep-link URL (reused, already supported by the server)

Loading the page with query params makes the server `start` action
(`dd_core_api`, lines ~293-303) resolve a single record in edit mode:

```
<page_path>?t=<tipo>&st=<tipo>&id=<section_id>&m=edit
```

For a section, `section_tipo === tipo`, so `st` and `t` are the same value.

The link href is built client-side as:

```js
const href = window.location.pathname
    + '?t='  + encodeURIComponent(tipo)
    + '&st=' + encodeURIComponent(tipo)
    + '&id=' + encodeURIComponent(section_id)
    + '&m=edit'
```

Rendered as `<a href=… target="_blank" rel="noopener">`.

## Components / files

1. **New view module** — `core/component_json/js/view_record_link_json.js`
   - Exports a `view_record_link_json.render(self, options)` returning a wrapper node.
   - Reads the component value `{ id, msg, tipo }`.
   - If `id` is a positive integer **and** `tipo` is a non-empty string → render:
     - the human `msg` text (as today), plus
     - a "Go to record" anchor: label e.g. `Go to <tipo> #<id> →`,
       `target="_blank"`, `rel="noopener"`, href as above.
   - Otherwise (older records with null/absent `id`, or non-activity shape) → fall back
     to the existing text rendering so nothing regresses.

2. **View router wiring** — `core/component_json/js/render_list_component_json.js`
   - Route to `view_record_link_json` when the component is the activity DATA component
     (component tipo `dd551`). Keep `default`/`mini`/`text`/`collapse` unchanged for all
     other cases.

3. **(Conditional) Column visibility** — to be confirmed against the running app:
   whether `dd551` is already shown as a list column in the activity area. If yes, no
   further change. If no, enable it via the lightest available config; if that proves to
   require ontology edits, raise with the user before proceeding (this would cross into
   Option 2 territory).

## Edge cases

- `id` null / absent (pre-fix or non-edit events) → no link, plain text (no regression).
- `tipo` missing → no link.
- Record later deleted → link opens an empty edit view (acceptable, documented).
- `id` / `tipo` are URL-encoded to avoid breaking the query string.

## Testing / verification

- Run the app, open the activity area list, confirm a "Go to record" link appears on a
  LOAD EDIT row that has a populated `id` (e.g. the rsc197 / id 27 record verified
  earlier), and that clicking opens a new tab at that record in edit mode.
- Confirm rows without `id` show plain text (no broken link).
- Confirm other `component_json` instances elsewhere are unaffected (still open the
  JSON-editor modal in list mode).

## Risks

- Column-visibility uncertainty (item 3). Mitigation: verify empirically during
  implementation; escalate before any ontology change.
- Deep-link `start` behavior for `m=edit` + `id` to be validated in the running app.
