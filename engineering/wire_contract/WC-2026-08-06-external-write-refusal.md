# WC-2026-08-06-external-write-refusal — a derived component is never written, and neither is the remote service

- **Date:** 2026-08-06 (the write-path half of the external-record subsystem).
- **Decision:** — (DEC-12 gate shipped with it:
  `test/unit/external_write_refusal_tripwire.test.ts`, registered in
  `engineering/TRIPWIRES.md` + `scripts/verify.ts`).

### Shape before (PHP)

`component_external` extended `component_common`, so the whole generic write
path was reachable through it, and one branch used it deliberately:
`core/component_external/class.component_external.php` carried an explicit
`# Tool Time machine case` branch that called `parent::set_dato()`. A Time
Machine restore therefore WROTE the snapshotted remote answer into the
component's matrix column, after which the record held a local copy of a third
party's data with no provenance and no expiry.

The retired engine had no refusal anywhere else either: the model was simply
absent from the paths that would have exercised it (no import parser, and
`section::delete_data`'s `$excluded_model_to_empty` skipped it), so "we never
write it" was true by omission, not by rule.

### Shape after (TS)

**The rule, stated once:** Dédalo never writes to an external service, and never
writes a remote value into a matrix record or into `dd_ontology`. The only
curated thing written is the CALLER's locator.

Mechanically, in the order a write would have to get through:

1. **Import** — the descriptor declares no `importConform`, and every cell shape
   is refused per cell (`WC-2026-08-05-external-derived-emission`;
   `src/core/tools/import_data.ts:259-270` is the derived-field refusal that
   catches the JSON and EMPTY shapes ahead of the no-facet tail).
2. **Save** — `saveComponentData` THROWS `ExternalWriteRefused` before the
   transaction opens, for any component whose descriptor declares
   `emitHook: 'external'`. The predicate is the FACET, not a model-name list: a
   model whose emission is owned by the external hook derives its value from a
   service at read time, and that is exactly the property that makes it
   unwritable. The check sits after the `component_alias` hop, so an alias door
   onto an external tipo is refused too.
3. **Delete** — `component_external` stays in `EXCLUDED_EMPTY_MODELS`
   (`src/core/section/record/delete_record.ts`), now EXPORTED so the gate
   asserts the membership rather than trusting a comment. Emptying it would
   write a Time Machine backfill row and a column key for data the record never
   held.
4. **Subsystem confinement** — no module under `src/external/**` imports
   `matrix_write` / `json_codec` / anything under `core/db/`, names a `matrix_*`
   or `dd_ontology` table, or holds any DML. The adapters are pure functions
   over a payload; the transport is the only door.
5. **Outbound** — the descriptor exposes exactly two request builders
   (`buildRecordRequest`, `buildSearchRequest`), whose `ExternalRequestSpec`
   admits only `'GET' | 'POST'`, and the transport now checks the verb at
   **step 0**, ahead of the kill switches, refusing anything else with
   `bad_config` and no socket. The type alone was not the invariant: an adapter
   is DATA, so a cast or a generated adapter carries whatever it carries, and a
   `DELETE` that reached the socket would already have destroyed a remote
   record.

Unchanged: the caller's relation write. `{type:'dd53', section_tipo:'zenon1',
section_id:'001338683', from_component_tipo:'rsc368'}` is an ordinary locator on
an ordinary component (`rsc368` is a `component_autocomplete`), written through
the normal save path with the zero-padded string id byte-identical. The gate
carries it as a positive control, because a refusal that also broke the one
legitimate write would be the worse regression.

### Reason

Time Machine restore is the only behaviour actually removed, and it is a
DELIBERATE DIVERGENCE from the retired engine. The census that licenses it,
measured against the application database:

- `matrix_time_machine` holds **ZERO** rows for any `component_external` tipo —
  there is no snapshot anywhere that a restore could put back;
- the one external section, `zenon1`, has **ZERO** matrix rows in every matrix
  table, and no `matrix_zenon` table exists — there is no row to restore INTO.

So the branch could not fire on this installation, and if it ever did it would
produce the pathology it was written to avoid: a local fossil of a remote record
that the read path never consults (emission is owned by `emitHook: 'external'`,
which never reads the column) and that no refresh would ever correct.

The wider rule is not a limitation of the current implementation but the
subsystem's contract. An external record belongs to somebody else. Writing back
to it from a cataloguing action would be an institution mutating another
institution's catalogue as a side effect of describing an object.

### Gate reconciliation

`external_write_refusal_tripwire` asserts all five axes plus the positive
control. `external_degradation_tripwire` already asserts the descriptor keeps
`emitHook` and declares neither `resolveData` nor `importConform`; this entry
adds the save/delete/confinement/outbound halves.

**No parity fixture is affected**: no fixture holds a data item for any
`component_external` tipo, and no fixture exercises a save. **Re-harvest: NO —
impossible by definition.**
