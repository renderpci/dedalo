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
<page_path>?tipo=<tipo>&id=<section_id>&mode=edit&menu=false&session_save=false
```

- `section_tipo` is omitted — the server falls back to `section_tipo = tipo`, correct
  for a section.
- `menu=false` opens a clean standalone record view (no left menu).
- `session_save=false` prevents the new tab from overwriting the main window's session
  SQO for this section.

The button href is built client-side as:

```js
const href = window.location.pathname
    + '?tipo=' + encodeURIComponent(tipo)
    + '&id='   + encodeURIComponent(section_id)
    + '&mode=edit'
    + '&menu=false'
    + '&session_save=false'
```

Rendered as `<a href=… target="_blank" rel="noopener">` styled as a button.

## Components / files

> Refinement discovered during implementation: the Activity section already routes
> `dd551` through the **`collapse` view** (`view_collapse_list_json`), which has a
> dedicated `dd542` branch that renders the `{ id, msg, tipo }` value as `key: value`
> lines and participates in row collapse/expand sync. Introducing a *new* view and
> rerouting `dd551` away from `collapse` would **lose** that collapse-sync behavior — a
> regression. The cleaner, still code-only and activity-scoped change is to enhance the
> existing `dd542` branch of the collapse view. This resolves the open column-visibility
> item too: `dd551` is confirmed a visible list column.

1. **Enhance the collapse view** — `core/component_json/js/view_collapse_list_json.js`
   - Add a pure helper `build_record_link(value)` that returns an `<a>` element (or
     `null`):
     - `null` when `value.id` is not a positive integer (older rows log null) or
       `value.tipo` is not a non-empty string.
     - otherwise an anchor with `href` = the deep-link URL above, `target="_blank"`,
       `rel="noopener"`, class `activity_record_button`, **icon-only** (no visible
       text), with the `Go to record` label exposed via `title` (tooltip) and
       `aria-label`. Its own `click` handler calls `e.stopPropagation()` so pressing
       the icon does not toggle the row collapse.
   - In `render()`, for the `dd542` case only, read `self.data.entries?.[0]?.value`,
     build the icon button, and append it to the wrapper when non-null.
   - `get_value_string` is left unchanged (still renders the `key: value` summary), so
     older/non-edit rows simply show no icon — no regression.

2. **Minimal CSS** — `core/component_json/css/component_json.less`
   - Style `.activity_record_button` as an **icon** (1.1rem square, CSS-mask of
     `themes/default/icons/arrow_link.svg` tinted with `--color_primary`, hover raises
     opacity), **absolutely positioned in the cell's right-hand zone**
     (`position:absolute; top:0.5rem; right:0.6rem`), with the wrapper made
     `position:relative`.
   - It sits inside the always-visible 2.5rem band, so the icon stays visible whether
     the activity row is collapsed or expanded. Icon-only keeps it unobtrusive.

3. **Visited feedback** — so already-opened records are easy to spot in a long list:
   - JS adds a `.visited` class on click (`view_collapse_list_json.js`) → immediate
     feedback in the current list; CSS greys the icon (`@color_grey_10`) and dims it
     (`opacity:0.4`, `0.7` on hover).
   - CSS `:visited` greys the icon too — this persists across reloads via browser
     history (each record has a unique deep-link URL). Per CSS privacy rules `:visited`
     permits color only, which is exactly the "soften the color" intent.

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
