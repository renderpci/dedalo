# WC-2026-09-04-context-render-class — `render_class` on every component context entry and grid cell

- **Date:** 2026-09-04, adopted with the change that closes audit row
  P2-6-residue (CARRY-01 / XSS-03, CLI-21, systemic S-4).
- **Decision:** DEC-12 (the invariant lands with its gates:
  `test/unit/render_escape_tripwire.test.ts` — the client half, a TOTAL derived
  census of every HTML sink; `test/unit/render_class_native.test.ts` — the
  server half, save + read on a `zz` scratch situation;
  `test/unit/descriptor_completeness_tripwire.test.ts` — every canonical
  descriptor declares the facet; `test/unit/site_builder_csp_tripwire.test.ts`
  — the generated-site consumer). The fixture census consequence follows
  WC-2026-08-23-dedalo-files-post-harvest-census (one new client file).

## Shape before (PHP)

A structure-context component entry (`build_structure_context`) carried no
statement of how the client may render the value: `{typo, type, tipo,
section_tipo, model, legacy_model, label, mode, lang, view, permissions,
properties, css, tools, buttons, sortable, …}`. A `dd_grid_cell_object` carried
`model` and nothing about rendering either. The client decided per view, by
hand, and mostly decided `innerHTML`; the server sanitized ONE model by its
name (`component_text_area`) on save and stored every other value verbatim.

## Shape after (TS)

ADDITIVE. Every COMPONENT context entry (`resolve/structure_context.ts`,
stamped from the cached core) carries

    render_class: 'text' | 'html' | 'url' | 'number'

derived from the model's descriptor `render` facet
(`src/core/components/<model>/descriptor.ts`, `types.ts` RenderClass;
`registry.ts` getRenderClass, alias-following). Sections, groupers, areas and
every non-component entry carry NO such key (absent, not null). Every
`dd_grid_cell_object` with a component `model` (`section/indexation_grid.ts`
`cell()`, `components/component_info/widgets/grid.ts` `ddGridCell()`) carries
the same key, derived the same way; a cell without a component model carries
none.

The classes: `html` is component_text_area only (and its aliases
component_html_text / component_input_text_large through the hop) — the ONE
class the write engine sanitizes on save (`save_component.ts` now keys the
sanitizer on `getRenderClass(model) === 'html'`, not on the model string);
`url` is component_iri; `number` is component_number; every other
column-bearing model is `text`.

ONE model-less cell carries the key by its own nature: the indexation grid's
`text_fragment` column (`indexation_grid.ts`, `class_list: 'text_fragment'`)
is a slice of the RICH text — `fragmentFromTag` decodes the stored entities
back to markup, exactly as PHP `component_text_area.php:474-476` did before
injecting it raw — so it is stamped `render_class: 'html'` and its value is
run through the ONE sanitizer (`security/html_sanitize.ts`) server-side:
inline formatting survives as markup in the grid, an executable payload does
not (a pre-XSS-01 or migrated value is what the decode re-creates).

A renderer never widens the class on its own: `render_value(x, 'html')` with
a literal is a passthrough by name (the census classifies it dynamic); the
class handed to the escaper is the wire's `render_class` or a NARROWER
literal. The one enumerated exception is the external record renderer, whose
`markup` branch translates a per-ENTRY wire kind (server-sanitised).

The client consumer is ONE module, `client/dedalo/core/common/js/utils/
render_escape.js` (`render_value`, `render_join`, `render_fallback_value`,
`escape_html`): every component render file and the dd_grid switch on
`self.context.render_class` / `data_item.render_class` there and nowhere
else. An absent, unknown or misspelt class escapes as text; a `url` value
whose scheme the allowlist refuses (`urn:`, `ark:`, `doi:`, `info:` — heritage
identifiers are IRIs, not links) renders as escaped TEXT, never blank and
never markup — a text node cannot navigate, the href sinks keep their guard
(`url_sink_allowlist_tripwire`). The login page's
info panel (CLI-21) escapes every value and renders array values one per line
with the panel's own `<br>`, never joined into markup.

## Reason

The client is the only consumer that can escape at the boundary, and it can
only do so correctly if the server says which values ARE markup. Without the
key every renderer either escapes nothing (the audit's state: hundreds of
unescaped `inner_html` sinks, inert only while the app CSP holds) or has to
guess by model name in a second place (the drift CLAUDE.md forbids: a fact
derived twice). One facet, one wire key, one escaper.

## Gate reconciliation

- `test/parity/context_differential.test.ts` compares a NAMED subset of entry
  keys (`sortable`, `path`, … — `render_class` is not in it) and its coverage
  ledger lists PHP keys the TS side does not emit; an additive TS key is
  invisible to both, so the frozen fixtures are untouched. No re-harvest
  (impossible by definition, and not needed: the gate transforms before diffing
  — the WC-001 pattern).
- `test/parity/dedalo_files_differential.test.ts`: `render_escape.js` is one
  more entry in `POST_HARVEST_CLIENT_ADDITIONS`, with the recovery assertion
  proving it serves.
- `test/unit/indexation_grid_av_native.test.ts` strips the additive key from
  the AV golden (COUNTED) and holds the native `text_fragment` leg (markup
  kept, handler/script gone, `render_class: 'html'` present).
- `test/parity/indexation_grid_differential.test.ts` (the generic-TLD
  replacement, WC-2026-08-19) and `test/unit/info_widget_native.test.ts`
  strip the additive key from every grid CELL through the ONE shared
  `stripRenderClass` (`test/parity/normalize.ts`) before the deep-equal, and
  COUNT it: a case whose TS grid renders any cell must have carried the key
  (`> 0`; section-level cells hold no model and no class). The frozen grids
  are untouched. The rsc167 cases of the differential stay red for the
  pre-existing clone-root label drift, not for this key.
- `test/unit/external_client_render_tripwire.test.ts` still finds exactly ONE
  HTML sink in `external_render.js` — the server-declared `markup` branch,
  which now enters the escaper as `render_value(value, 'html')`.
