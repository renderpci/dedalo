# component_info widgets — the IPO widget framework

component_info is the formula/process component: an instance's ontology
`properties.widgets[]` declares widgets (`{widget_name, path, ipo}`) that
**import** data from other components, **process** it, and **output** result
items (IPO). Widget code is organized by discipline TLD, mirroring PHP
`core/widgets/<tld>/<name>/` and the byte-identical client
`client/dedalo/core/widgets/<tld>/<name>/js/`.

Dispatch is **by `widget_name` through `registry.ts`** — never by loading
code from the ontology-authored `path` (the TS answer to PHP's
include-by-path). The `path` on each descriptor is verification data: the
tripwire binds it to the client module that renders the widget.

Enforced invariants (test/unit/info_widget_registry_tripwire.test.ts — the
authoritative list; this README only points at it):
client-tree path binding · gate coverage per ported widget · ledger row per
unported stub · single dispatch home · DB census over declared widget_names.

## Files

| File | Role |
|---|---|
| `widget_common.ts` | `InfoWidgetDescriptor` contract, `WidgetContext`, shared IPO helpers (`readWidgetComponentData`, `resolveCurrent`, `findTyped`, `phpRound`), the two loud errors |
| `grid.ts` | dd_grid_cell_object builders (`buildPortalGridValue`, `resolveGridColumns`) |
| `registry.ts` | `INFO_WIDGETS` map + `computeInfoWidgets` (read aggregate) + `computeInfoDataList` (edit datalist) + `getInfoWidget` (fail-loud lookup) |
| `calculation/functions.ts` | STATIC calculation process-fn registry (SEC-052 twin) |
| `<tld>/<name>.ts` | one widget = one module exporting one `InfoWidgetDescriptor` |

## Add a widget (the honest checklist)

1. **Read the PHP oracle class** `core/widgets/<tld>/<name>/class.<name>.php`
   and the client twin `client/dedalo/core/widgets/<tld>/<name>/js/` — the
   client render's matching keys (`widget_id` vs `id`) and the `is_async()`
   flag are part of the contract.
2. Create `widgets/<tld>/<name>.ts` exporting `export const <name>:
   InfoWidgetDescriptor = { name, path, computeData, … }`. `name` must equal
   the ontology `widget_name` AND the client JS class/file name; `path` must
   equal the ontology `path` (the tripwire checks the client module exists).
   Optional facets: `isAsync` (PHP `is_async()`), `computeDataParsed` (PHP
   `get_data_parsed` — grid/export/diffusion), `computeDataList` (PHP
   `get_data_list` — edit datalist).
3. Register it in `registry.ts` (`INFO_WIDGETS` array).
4. Add a differential gate case naming the widget in its `test()` title
   (`test/parity/info_widget_differential.test.ts` pattern: scratch-twin
   fixtures, byte-compare vs the live PHP oracle — read the ORACLE TRAP note
   in CLAUDE.md first).
5. Calculation process fns: add to `calculation/functions.ts`
   `CALCULATION_FUNCTIONS` — never load ontology-named files.
6. Not portable yet? Register an `unported` stub (`{name, path, unported:
   {reason}}`) AND add the rewrite/LEDGER.md known-open row — the tripwire
   fails on either half missing. Compute then throws `WidgetUnportedError`
   (never silent []).

`bun test test/unit/info_widget_registry_tripwire.test.ts` tells you what is
missing at every step.
