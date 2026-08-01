# WC-059 — `source.is_temporal`: a temporal instance resolves, it never persists (2026-07-28)

> **(!) THE STORAGE HALF IS SUPERSEDED BY WC-079 (2026-07-30).** "It never persists"
> and "the read door serves an empty value" are no longer true for ONE opt-in case:
> a source that also carries `temporal_scope` (only `service_tmp_section` sends it)
> reads and writes a per-user row in `dedalo_ts_temporal_scratch`. Everything else
> in this entry still holds, including the load-bearing half — a temporal instance
> ADDRESSES NO RECORD, and neither door touches matrix record 1, its Time Machine
> rows or its activity rows. Read this entry for the invariant; read WC-079 for the
> storage.

The same shape as WC-058, one layer lower: a scope the TS port dropped, widening
silently into "a real record". Found while investigating why
`tool_propagate_component_data` is unreachable from section list mode.

A **temporal instance** is a tool's throwaway editable clone — the propagate tool's
value widget, `service_tmp_section`'s staging form (behind tool_import_marc21 /
zotero / files), the `component_text_area` draw and reference pickers. It has no
record: the client stamps a **sentinel** `section_id: 1` on it and sets
`source.is_temporal` (PHP commit `5c45c71ebb`, 2026-01-31), which PHP routed to a
scratch store — `matrix_temp_manager`, a `(section_tipo, logged_user_id)`-keyed row
in the unlogged `temp` table.

The TS rewrite (`d31bad80c1`) carried the five client producers over and **did not
port the store**. `rqoSourceSchema` was `.passthrough()`, so the flag rode along
unread, and the save door handed `sectionId: Number(source.section_id)` — the
sentinel — straight to `saveComponentData`. Consequences on the **real** record 1 of
the target section, every time such a tool was opened: the component's value
replaced (`set_data` is a bulk replace; a phantom record is CREATED if record 1 was
absent — `save_component.ts` `createSectionRecord({conflictTolerant:true})`), a Time
Machine row appended, the dd197/dd201 modified stamp falsified, an activity `SAVE`
row written, and for relation components an orphan record created in the target
section plus a rewritten `relation_search`. Audited as a legitimate edit and
therefore invisible in the TM UI — and, for the same reason, recoverable.

Blast radius by producer: `tool_propagate_component_data` writes **once per tool
open**, unconditionally, from `build()`; `service_tmp_section` writes **once per
field edit** (`change_value` → `save`); the text_area pickers write on use, and
`render_reference`'s `null` `set_data` **clears** the target. Global admins are
fully exposed (`isRecordInScope` is skipped for them); a scoped level-2 user is
exposed only where record 1 is inside their projects filter.

- **The save door normalizes and echoes.** `resolveTemporalSave`
  (`src/core/section/record/temporal.ts`) returns the canonical DataItem the client
  resolves by, with no read of the addressed record, no write to it, no Time Machine
  row, no modified stamp and no activity row.
  - It does **not re-apply** `changed_data` on the literal branch, and that is the
    subtle part. The persisted engine seeds from the LOCKED MATRIX ROW, so it
    cannot double-apply; a temporal instance has no row, so its only base is
    `data.entries` — which the client has ALREADY applied the delta to
    (`change_value` runs `update_data_value` over every item, mutating
    `self.data.entries`, and only then calls `save(changed_data)` with
    `clone(self.data)`). Re-applying failed every `remove` (the id is already gone,
    and the engine's unknown-id rule would 400 the user's deletion), duplicated
    every `insert`, and appended on every `update`. Only `set_data` is idempotent
    under re-application — which is exactly why the first cut of this door looked
    correct against a set_data-only gate.
  - What it DOES perform is the normalization the persisted path does on the way to
    storage, because the echo becomes the client's next `self.data`: the lang stamp
    (through the SAME predicate the engine uses — `isLangSlicedModel`, now exported
    from `save_component.ts`) and the item-id mint. Without the mint an id-less item
    stays id-less, the next `update` arrives with `id: null` and APPENDS, and the
    array grows on every committed edit — the array `tool_propagate_component_data`
    then writes across every matched record.
  - The relation branch needs no equivalent: `mergeRelationChips` is idempotent
    under both orderings (insert dedups by locator, remove is a filter).
  The relation branch reuses
  the pre-existing non-persisting `search_<n>` machinery, extracted to
  `src/core/section/record/resolve_echo.ts` and now shared by both doors — the
  client needs a labelled chip and a `pagination.total`, and only a real resolution
  produces them.
- **The gate is a READ level (>= 1) — except for the one action that writes.**
  Nothing is persisted, so the write grant is generally not the question being asked
  (the same reasoning the `search_<n>` branch already used). But `add_new_element`
  really does create a target record, and this branch deliberately short-circuits
  the level-2 gate, the record-scope gate and `refuseAreaWrite` — so admitting it at
  level 1 would be a read→create escalation. The required level is therefore a
  function of the batch: **2 when any change is `add_new_element`, 1 otherwise.**
- **The read door serves no record.** `readComponentData`'s `hasRecordId` is false
  for a temporal source, so it resolves context and datalist with an EMPTY value
  (the existing record-independent path, shared with synthetic search ids) instead
  of serving a stranger's record as the clone's starting value; `read_facade` skips
  the per-record scope gate there for the same reason.
- **The record-lifecycle doors refuse it.** `create` / `duplicate` / `delete` answer
  400 — a lifecycle action on something that addresses no record is nonsense, and
  refusing keeps the totality assertion literally true.
- **`add_new_element` still creates its TARGET record**, and only that: the
  host-filter read is skipped (`applyAddNewElement({skipHostFilterRead:true})`), so
  the new record inherits the default project locator. PHP's temp store behaved the
  same way — the target is real, only the host anchor was scratch. A consultation-only
  target is refused with 400 (without it the `createSectionRecord` engine THROWS on
  dd542/dd15 — a 500 where a 400 is the honest answer).
- **The select family keeps its datalist.** Every `SELECT_FAMILY_MODELS` member is a
  RELATION-column component, so the datalist attach lives on the relation branch;
  placed on the literal branch it could never execute, and the client's post-save
  render (`component_radio_button get_checked_value_label`) dereferences it.
- **`is_temporal` is now DECLARED** on `rqoSourceSchema` rather than swallowed by
  `.passthrough()`, and `isTemporalSource` — beside the declaration, because
  `section/read.ts` needs it and a predicate in `temporal.ts` would close a static
  import cycle — is the single reader.
- **The sentinel is left alone.** `section_id: 1` stays on the wire and is now
  inert; the doors branch on the flag, never on the value.

**The generalisation, extending WC-058's:** a client-supplied record id on an
instance that declares itself record-less is a **wire field, never an address**. A
scope the port dropped must fail closed, not widen into whatever the raw value
happens to name.

Gated by `test/unit/temporal_instance_tripwire.test.ts` (8 tests). The behavioural
half asserts the canonical test3 record 1 is byte-identical with no new TM and no
new activity row after a temporal save, and carries a CANARY — a real save on a
scratch twin — proving those same three probes can see a write, so "nothing
changed" cannot pass vacuously. Mutation-proved: deleting the temporal branch from
`dd_core_api.ts` turns it red.
