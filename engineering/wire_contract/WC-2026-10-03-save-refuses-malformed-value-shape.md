# WC-2026-10-03-save-refuses-malformed-value-shape — the save door refuses a value its model does not store

- **Date:** 2026-10-03.
- **Decision:** DEC-12 (the law lands with its gate:
  `test/unit/value_shape_native.test.ts`). Code: `src/core/section/record/value_shape.ts`
  (`valueShapeRefusal`), called by `saveComponentData` (`save_component.ts`) before the
  transaction opens; the import door's normalization in `src/core/tools/import_conform.ts`
  (`conformNumber` / `numberItems`, `textItem`).

## Shape before

**PHP** `component_common::set_data` WRAPPED a non-object element into `{value: <element>}`
and `component_number::set_data` cast a numeric string (`is_numeric`) and dropped a
non-numeric one, both logging and answering success.

**TS until this entry** stored whatever arrived, ok:true (measured 2026-10-03 on a scratch
twin):

- `{action:'update', key:0, value:'<bare string>'}` on a translatable
  component_input_text persisted the bare string beside the other languages' items; the
  next save in another language DROPPED it (the lang-sliced merge discards non-objects), so
  the second language replaced the first;
- `update` with `value:null` stored a `null` item; a number `value:55` stored `[55]`,
  `{value:'55'}` a string no numeric search matches;
- a non-array `set_data` (or one with scalar/null elements) emptied the language slice.

## Shape after (TS)

`saveComponentData` refuses, before the transaction (nothing written, no counter raised, no
Time Machine row, a missing record not created), with **`request.invalid_data`**
(caller/400, disclosure `operator`; coordinates name `tipo` and `model`) any
value-carrying change whose shape the model's column does not store:

- `insert` / `update`: `value` must be ONE plain object item;
- `set_data`: `value` must be an array of plain object items, or null (the explicit empty);
- the literal families type the fields the engine reads — absent and null always accepted
  (the client's empty slot is `{value:null}`): `string` → `value` a string; `number` →
  `value` a finite number; `date` → `start`/`end`/`period` objects; `iri` → `iri`/`title`
  strings. `misc`, `geo`, `media`, `relation` get the item-ness check (relation locators are
  then normalized by `validateRelationInsert`, which a bare scalar used to bypass);
- `section_id` is exempt (component_section_id stores the bare record id);
- `remove`, `clear`, `sort_*`, `add_new_element` carry no item and are untouched.

The refusal names the value's KIND, never its content (it can be a password).

**Divergence from PHP, deliberately:** no wrapping, no cast at the save door. A door that
legitimately holds a looser shape normalizes it there: the CSV/JSON importer casts a JSON
number cell's numeric strings (PHP `is_numeric` grammar; a non-numeric one is refused for
the cell, never stored or silently dropped) and writes a JSON number in a text cell as its
string.

## Census (what sends a value-carrying change)

Measured 2026-10-03 (a static census, then `bun run test:client` with the server log
searched for the refusal): the client builders of `insert`/`update`/`set_data` send an
object item (`{value:null}` for an empty slot) or route a null value to `remove`; null
`set_data` comes only from relation pickers. ONE shipped exception, fixed at its door in
the same change: component_date's edit `change_handler` sent `update` with `value:null`
when a date input was emptied (stored as a `null` item until now). It now builds through
`build_date_changed_data_item` (`render_edit_component_date.js`) — a `remove` of the stored
item id, nothing for a never-stored slot — the same builder its remove button uses. Two
client-suite cases (date, geolocation) that mimicked the null update were moved to the
remove they meant; after the change the client run logs no refusal. Every server caller of
`saveComponentData` (importers, tools, MCP, maintenance) builds object items. The MCP
`dedalo_save_component` documents `value` as `{id, value, lang}` or a locator; an agent's
bare scalar is now refused with the same code. The temporal door
(`section/record/temporal.ts`) is not covered: it persists nothing, and its relation
callers (`render_draw.js`) pass a single locator to `set_data`, which it accepts.

## Reason

A write that stores a shape no reader serves is a silent loss: the value is either
invisible or destroys its sibling language on the next save, while the caller was told it
succeeded. Refusing is the only answer that keeps the stored data readable.
