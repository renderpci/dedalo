# WC-2026-08-30-remove-requires-item-id — a `remove` names the item it removes; clearing is `clear`

- **Date:** 2026-08-30, adopted with the change that closes audit row DATA-06 (P0-8).
- **Decision:** DEC-12 (the invariant lands with its gate:
  `test/unit/remove_sentinel_native.test.ts`). The divergence is DELIBERATE: it
  removes a PHP behaviour that destroyed data, and it is not recoverable by any
  transformation of the response, so it is recorded here rather than absorbed.

## Shape before (PHP, and TS through 2026-08-29)

`component_common::update_data_value` with `action:'remove'` branched on the id:

- an id that matches a stored item → that item is removed (in every language,
  since translated items share ids);
- an id that is **not** stored → the whole save FAILS
  (`save_component.ts`: `remove: no item with id N`);
- **no id at all** → every item of the component, in every language, is deleted,
  and the save answers `ok:true`.

That third branch was the one the TS engine carried verbatim, with the comment
`// PHP: id null = clear ALL entries in all languages.`

## Shape now (TS)

Two changes to the `changed_data` wire vocabulary:

1. **A `remove` MUST carry an item `id`.** A remove with `id` null/absent/`''`
   is refused before the transaction opens — `record.remove_without_id`
   (caller/400, disclosure `public`), nothing written, no TM row. A `key` on the
   change does not substitute for the id and is named in the refusal: `key` is a
   position in the rendered array, and no branch of the write engine resolves a
   position to an item.
2. **`action:'clear'` is the explicit wipe** — every item of the component in
   every language, whatever the request lang. It is the behaviour the id-less
   remove had, behind a word that says so. Accepted by the persisted door
   (`save_component.ts`), by the temporal door (`temporal.ts` TEMPORAL_ACTIONS +
   `resolve_echo.ts mergeRelationChips`, which empties the DURABLE base, not just
   the client's page), and by the MCP door (`dedalo_save_component`).

The MCP door additionally refuses `action:'remove'` without `item_id` in the
handler, before any permission probe: the schema's `item_id` is optional because
zod validates one field at a time, so the conditional requirement has to be
stated where it can be enforced — and stated in the tool description, which is
what the agent actually reads.

## Reason — why the PHP branch is not a contract worth preserving

The oracle's own honest branch is one line below it: a remove naming a **wrong**
id fails the entire save. So PHP refused the caller who named the wrong item and
destroyed everything for the caller who named none. That asymmetry is an
inconsistency in PHP, not a semantic.

And no caller of consequence ever meant "all" by it — `null` is every caller's
UNKNOWN-ID sentinel:

- `client/dedalo/core/component_number/js/render_edit_component_number.js` —
  `remove_handler(input, current_value?.id, self)` (:328) against a renderer that
  writes `id: item.id || null` (:556): one row's delete button on an unsaved (or
  id-0) slot deleted every number in the component;
- `client/dedalo/core/component_input_text/js/render_edit_component_input_text.js`
  `_do_remove` (:367) and
  `client/dedalo/core/component_email/js/render_edit_component_email.js`
  `_do_remove` (:722) — both send `{id, key}` with a null id for an unsaved row;
- `client/dedalo/core/component_filter_records/js/component_filter_records.js`
  `build_changed_data_item` (:136) — leaves `entry_id` null whenever the tipo is
  not among the entries it was handed, so clearing ONE section's record filter
  dropped that user's filters for ALL sections. That one WIDENS what an account
  can read;
- the MCP door: `item_id` was optional and mapped onto `id:null`, so an agent
  asked to "remove the English title" deleted every other language and was told
  it had succeeded (the confirmed S2).

The client already half-knew: `component_common.js update_data_value` guarded
its own clear-all fallback with `!id_not_found` so the wildcard would not fire on
a stale id. The server had no such guard at all.

For a Cultural Heritage engine the ranking is not close: a refusal the curator
can read is strictly better than a silent, successful deletion of curated values
in languages nobody was even editing.

## Callers that legitimately meant "clear", and what happens to them

Four client sites send an id-less remove ON PURPOSE, all of them a Reset/clear
gesture with no `key`: `render_edit_component_check_box.js` (the Reset button),
`render_edit_component_filter.js` (Reset), `component_select.js` (the
single-value replace in `add_new_element`), `render_search_component_portal.js`
(clear the search chip). Each must send `{action:'clear'}` instead; until it
does, the door refuses it with a public 400 and writes nothing — loud and
immediate, which is the failure mode this whole entry prefers over a silent
successful wipe.

The client half of P0-8 lands in the same audit batch and in the same vocabulary:
`component_common.prototype.update_data_value` already carries the `clear` branch
("THE ONLY deliberate wildcard") and refuses an id-less `remove` before it
reaches the wire, citing DATA-06. Both halves are needed — the client refusal
protects the curator's click, the server refusal protects the record from every
other door (MCP, imports, a stale client).

## Gate reconciliation

- New gate: `test/unit/remove_sentinel_native.test.ts` — an id-less remove (with
  and without a `key`) throws `record.remove_without_id` and leaves the column,
  the item-id counter and the TM history byte-unchanged; `clear` empties every
  language and IS audited; a remove naming a real id still removes it across
  languages.
- `test/unit/save_roundtrip.test.ts` pinned the old behaviour ("id null → clear
  everything"); that assertion is rewritten in the same change to assert the
  refusal plus the explicit `clear`.
- No parity fixture is affected and **no re-harvest is needed**: the frozen
  oracle store holds READ responses, and no harvested gate sends a `remove`
  change. `test/unit/ontology_tld_native.test.ts` keeps asserting `ok:false` for
  an id-less remove on `ontology7` — that refusal is the ONT-TLD allowlist,
  which runs first and is unchanged.
