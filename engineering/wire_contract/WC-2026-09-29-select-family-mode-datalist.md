# WC-2026-09-29-select-family-mode-datalist — a select-family item in any non-list mode carries its datalist

- **Date:** 2026-09-29.
- **Decision:** the user's report: after `tool_time_machine` applied a value
  to `numisdata32` (`numisdata3/1`), the portal refresh crashed in
  `view_default_list_dataframe.js` — `rating_data.datalist.find` on
  `undefined`. DEC-12 gate:
  `test/unit/select_family_mode_datalist_native.test.ts`.
- Code: `src/core/relations/models/select_family.ts` (the mode switch).

## Shape before (TS, 2026-08-05 → this entry)

`selectFamilyResolver` answered three modes itself — `list` (label strings),
`edit` and `search` (stored locators + `datalist`) — and routed EVERY other
mode to the generic PORTAL path: paginated locators (`paginated_key` stamped
on each entry), a `pagination` block, `parent_section_id`, and **no
`datalist`**.

The one live input of that arm is the dataframe rating: a census of every
select-family ddo declared in the app DB ontology (2026-09-29) finds modes
`edit`, `list` and — only — `solved` on `rsc1246`, over 48 slots
(`numisdata251`, `numisdata188`, …; 49 in the 2026-08-05 census of
`WC-2026-08-05-multi-engine-ddo-expansion` §2). Those slots declare their rating
`component_radio_button` (`rsc1246`) twice: in `show` with `mode:'edit'`
(the widget) and in `hide` with `mode:'solved', role:'rating'` (the chip
colour source). Since that entry's structural dedup key both ddos are kept,
so every framed target emitted two `rsc1246` items, and the `solved` one had
no datalist. The client's rating lookup (`component_dataframe.get_rating`)
could land on it — after an apply, `update_datum` pushes new items in
reverse order, putting `solved` first — and the chip read crashed the whole
portal render.

Measured on `numisdata3/1` (app DB, `numisdata32` edit read), the `solved`
item before:

```json
{"tipo":"rsc1246","mode":"solved","entries":[{…,"paginated_key":0}],
 "pagination":{"total":1,"limit":10,"offset":0},"parent_section_id":585, …}
```

## Shape after (TS) = the PHP controllers

Every family controller (`component_radio_button_json.php`,
`component_select_json.php`, `component_select_lang_json.php`,
`component_check_box_json.php`, `component_publication_json.php`,
`component_relation_model_json.php`) switches `list` (and the retired `tm`
display mode) to the list value and answers **`case 'edit': default:`** with
the stored data + the datalist. The resolver now does exactly that: `list` →
labels; any other mode → stored locators as `entries` + `datalist`, no
portal pagination, no child expansion. Per model the default arm is the same
shape; the model differences (select_lang's project-language options,
check_box's tool hydration, select's `include_negative`) all live behind the
ONE door `getDatalist` already, and are unchanged.

The `solved` item after — same keys as its `edit` twin, plus its own mode:

```json
{"tipo":"rsc1246","mode":"solved","entries":[{…}],"datalist":[…4 options…], …}
```

Byte changes, for the `solved` item only: `+datalist`, `−pagination`,
`−parent_section_id`, `−entries[].paginated_key`. The item COUNT is unchanged
(9 items on the measured read, before and after).

**The PHP `tm` arm is not ported, deliberately.** PHP's `tm` case (list value;
for a radio_button inside a dataframe, data + datalist) has no reachable input:
the display mode `tm` is retired (`WC-2026-08-14-tm-ddo-mode-retired`,
`tm_mode_retired_tripwire`) — history cells are LIST reads and the tool's
preview pane is an EDIT read, both answered by the two arms above.

**Out of scope, recorded so it is not mistaken for covered:** PHP
`component_select` answers its list value as `[ get_value() ]` (one flat
string); TS answers the per-locator label array for every family member. That
is the `list` arm, untouched here.

## Client half (same day)

The client no longer depends on this entry's server change for the rating chip:
`component_dataframe.get_rating` prefers the item in the rating ddo's own mode that
carries a datalist, then any matching item with a datalist; `view_default_list_dataframe`
and `view_mini_list_dataframe` paint the default colour when no datalist is present;
`component_common.update_datum` inserts unseen data/context items in server emission
order (was reversed). Gates: `test_component_dataframe_rating.js`,
`test_component_common_update_datum.js`.

## Reason

A `solved` ddo exists to hand the client resolved data it consumes without
rendering; for a select-family member the resolved data IS the option list.
The client guard added the same day (default colour when no datalist) makes
the render survive a datalist-less item; this entry makes such an item not
exist.

## Gate reconciliation

- **Frozen store: no fixture edited, no re-harvest (impossible by
  definition).** Census of `test/parity/fixtures/oracle_harvest/`: `solved`
  appears only inside request_config ddo declarations (context), never as a
  data item's mode — PHP's composite dedup key collapsed the hide twin, so the
  oracle never emitted one. The only non-list/edit data items of family models
  in the store are `tm` items (`rsc20`, `rsc1246` in the `tm_*` gates), which
  TS serves as LIST reads under the retired-mode entry — the `list` arm, not
  this one.
- `select_family_mode_datalist_native` (new) builds a `zz` rating slot (show
  `edit` + hide `solved, role:'rating'`) over a radio_button whose options
  carry a hidden colour, frames two targets, and asserts EVERY rating item
  carries the stored locator and a datalist resolving the chip colour; plus,
  for all six family models on the test3 playground, `solved` = the edit read's
  entries + datalist and `list` has no datalist. Mutation-verified: the
  pre-entry resolver reddens 7 of its 8 tests.
- `select_family_echo_datalist_native` — unchanged (the edit/echo doors).
