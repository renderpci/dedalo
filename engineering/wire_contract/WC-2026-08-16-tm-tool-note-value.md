# WC-2026-08-16-tm-tool-note-value — the tool's annotation column shows its VALUE

- **Date:** 2026-08-16.
- **Scope:** `src/core/section/list_definitions/time_machine_list.ts`,
  `SURFACE_COLUMNS` — the `component` and `record` surfaces (the TOOL).
- **Related:** [WC-2026-08-14-tm-scope-server-owned](WC-2026-08-14-tm-scope-server-owned.md)
  (the columns became server-owned there), WC-2026-08-14-tm-ddo-mode-retired.

## Shape before

Every Time Machine surface emitted the annotation column (`rsc329`) with
`view:'note'`. The client routes that view to
`client/dedalo/core/component_text_area/js/view_note_text_area.js`, which renders
a single click-to-open ICON (grey / green when an annotation exists) and never
the annotation text.

## Shape after

The two TOOL surfaces emit `{ tipo:'rsc329', view:'text' }` — the flat inline
preview (`view_text_list_text_area`), the same view the component's own history
value already used. The tool grid is full-width and its "Anotación" column had
room for the text; an icon there hid the one thing the column exists to show.

`inspector_component` KEEPS `view:'note'`: that block is a narrow side panel
where the icon is the affordance, and it is the surface that still creates and
edits annotations through the note modal. No other surface changes; `snapshot`
and `browse` carry no annotation column at all.

## Gate

`test/unit/tm_list_definitions_native.test.ts` — "COMPONENT renders its value AND
its annotation as flat text" and "RECORD shows the annotation VALUE, not the note
icon" pin the tool surfaces; the inspector's `note` view stays pinned by its own
assertion in the same file.
