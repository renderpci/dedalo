# WC-2026-10-19-design-line-removed — the optional second design line leaves the wire; one palette axis remains

- **Date:** 2026-10-19 (owner decision: the "Calm Scholarly" line was a temporary
  vehicle for a redesign that has landed; the mechanism is removed).
- **Supersedes:** `WC-063-ts-native-core-client-files-absent` — the
  `design.js` / `design-init.js` bullet ONLY (its other three files stand).
- **Scope:** the client and its label catalogs (`src/core/labels/`). The engine,
  the API actions, the envelopes and the ontology are untouched.

## Shape before

`<html>` could carry a second, OPTIONAL palette axis `data-design="redesign"`:

- `core/page/css/redesign/_tokens.less` redefined the whole palette under
  `:root[data-design="redesign"]` (and its dark companion), including a
  `data-accent="pine"` variant;
- `core/page/css/redesign/_structure.less` re-shaped components under the same
  root;
- `redesign.less` was imported LAST by `main.less`;
- `core/page/js/design.js` read/wrote `localStorage.dedalo_design` and
  `core/page/js/design-init.js` applied the attribute before first paint;
- the edit menu rendered a `.design_toggle` button, but ONLY when
  `?design_preview` had been seen or `localStorage.dedalo_design_preview` was
  set, or when the line was already active;
- `get_dedalo_files` censused the two JS files (WC-063).

## Shape after

- No `data-design` attribute is read, written or served. `localStorage`
  `dedalo_design` / `dedalo_design_preview` are inert; nothing reads them, and
  no cleanup code runs.
- One palette axis: `data-theme`. `PALETTE_FILES` names two files
  (`layout/vars_tokens.less`, `layout/theme_dark.less`); the served root
  palettes are `light` and `dark`.
- The two JS files leave the `get_dedalo_files` census, and
  `isTsNativeCoreFileEntry` no longer filters them.
- Three palette tokens that only the design line consumed
  (`--color_orange_border`, `--color_orange_hover_bg`,
  `--color_orange_hover_border`) are deleted, with their LESS aliases.

## Why

A whole second palette, a component override layer, a hidden toggle and a
startup script existed for one opt-in line. The design work it carried is in the
classic sheets; keeping the mechanism meant two palettes to gate on every
colour change, and a `data-theme` × `data-design` × `data-accent` corpus whose
combinations existed for nothing.

## Consequences a consumer can see

- A user who had opted in returns to the classic design. Nothing else changes
  for anyone: the line was invisible until `?design_preview=1`.
- The gates that derived their corpora from served roots now derive `light` and
  `dark` only. The pinned floors follow the measured corpus (contrast pairs,
  root declarations, distinct token values).
- `palette_axis_parity_tripwire` leg 3 (RESOLVED DIVERGENCE) had no subject left
  once the second axis was gone — it compared one axis' combinations against
  another's — and is removed rather than left vacuously green.
