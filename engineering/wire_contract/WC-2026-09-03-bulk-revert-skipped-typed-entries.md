# WC-2026-09-03-bulk-revert-skipped-typed-entries — `bulk_revert_process` reports a skipped row as a typed entry, and locates it only when the caller may see it

- **Date:** 2026-09-03. Adopted with the SEC-16 remediation (audit
  `audits/2026-08-26_deep`, backlog item P2-8 residue).
- **Decision:** DEC-15 (the client is the spec at this seam; it reads none of
  this channel) and the disclosure law of `engineering/ERRORS_SPEC.md`: the
  wire carries CODES and deliberate sentences; an exception that merely
  happened travels to the log, never to the caller.

## Shape before (PHP)

`tool_time_machine::bulk_revert_process` answered `{result, msg, errors[]}`
where `errors[]` was a list of SENTENCES, one per row it did not revert, in the
legacy body's failure channel. The TS port kept the sentences and moved them
into the success payload (`data.skipped: string[]`, since the batch never
fails on one row):

```
"skipped": [
  "permissions_denied: numisdata3/numisdata5#1187",
  "no pre-batch state: numisdata3/numisdata5#1190",
  "numisdata3/numisdata5#1191: relation \"matrix_private\" does not exist"
]
```

Two disclosures rode that channel:

1. **Coordinates outside the caller's scope.** The batch row set comes from a
   `matrix_time_machine` search that applies NO projects filter, the bulk id is
   a small enumerable integer, and the module gate is level 2 on the request's
   OWN section. So a level-2 holder on any one section could post bulk ids
   1, 2, 3… and read, off the `permissions_denied` entries, the
   `section_tipo/tipo#section_id` of every record in every project a batch
   touched — record existence and coordinates in projects they cannot see, and
   the shape of other users' bulk operations.
2. **Raw exception text.** The per-row catch pushed `(error as Error).message`
   verbatim (Postgres relation names, absolute filesystem paths) — and that
   catch also wrapped the scope gate itself, so a throw from inside the gate
   leaked the out-of-scope coordinates as well. The frameless-wipe refusal text
   (slot tipos) rode the same channel.

## Shape after (TS)

`data.skipped` is a list of TYPED entries:

```
"skipped": [
  { "reason": "out_of_scope" },
  { "reason": "no_pre_batch_state", "section_tipo": "test2", "tipo": "testmint1002", "section_id": 905203 },
  { "reason": "failed" }
]
```

- `reason` is a closed vocabulary (`BulkRevertSkipReason`, exported from
  `tools/tool_time_machine/server/bulk_revert.ts`): `out_of_scope` (the caller
  lacks level 2 on the (section_tipo, tipo) pair OR the record is outside their
  project scope — ONE code for both halves, because telling them apart already
  says whether the record exists), `no_pre_batch_state`, `no_column`,
  `frameless_wipe`, `no_lang`, `failed`.
- `section_tipo` / `tipo` / `section_id` are present ONLY on an entry for a row
  that PASSED the per-row scope gate (`inScope`, set after both halves pass).
  An `out_of_scope` entry never carries them; a `failed` entry carries them only
  when the throw came from after the gate. A denial is COUNTED on the wire,
  never LOCATED.
- No entry carries words. The refusal text — the frameless slot names, the
  exception message — goes to the server log as one line per skipped row,
  tagged with the request id
  (`[tool_time_machine/bulk_revert] request <id>: bulk <n> row <coords> skipped (<reason>): <detail>`),
  which is the channel an operator investigating a partial revert already
  reads.
- `counter` and `bulk_process_id` are unchanged.

## Reason

The client never read the strings: `render_tool_time_machine.js` tests only
`response_data(response)` truthiness and closes the window; the JSDoc that still
described `response.errors` was a fossil of the PHP body and is corrected in
the same commit. A sentence per row on a machine channel therefore served
nobody — except a caller enumerating other projects' records. The project's own
posture already decides the shape: the sibling door (`apply_value`) keeps its
refusal text LOG-only, and the errors spec puts codes on the wire and prose in
labels. Keeping `string[]` with sanitized strings was the alternative; it keeps
prose on a machine channel and gives the client nothing to key on, so the typed
shape is the structurally right one.

## Gate reconciliation

- `test/unit/tm_bulk_revert.test.ts` (db tier — seeds `matrix_time_machine`
  batches and scratch records on the suite database, mocks `record_scope` and
  the resolver): the scope-denied response JSON carries NO `section_id`,
  `tipo` or `section_tipo` of the batch's records yet one `out_of_scope` entry
  per batch row; a planted `getModelByTipo` throw carrying a path-shaped
  sentinel yields `failed` entries with neither coordinates nor the sentinel;
  and the POSITIVE CONTROL — an in-scope record whose whole history belongs to
  the batch — yields `no_pre_batch_state` entries that DO carry coordinates,
  so the omission is the gate's doing, not a channel that never locates.
- `test/unit/tm_dataframe_restore_native.test.ts`: the frameless-wipe refusal
  is asserted as a `frameless_wipe` entry with the row's coordinates (it is in
  scope), no longer as a substring of a sentence.
- `test/unit/wire_disclosure_tripwire.test.ts` (hermetic): the door carries no
  `permissions_denied` interpolation, pushes no raw exception text into any
  list, gates the coordinates on the scope flag, and logs with the request id.
- `test/unit/error_taxonomy_tripwire.test.ts` A6 (hermetic, new with this
  entry): no raw exception text keyed into a payload or pushed into a list
  anywhere in the tree except the enumerated, reasoned, shrink-only sites;
  `bulk_revert.ts` (and `src/ai/identify/vision.ts`, SEC-18's third site,
  fixed in the same commit — its `declined.detail` is now a deliberate
  sentence) are at 0 and may not be exempted.
- **No re-harvest.** No frozen oracle fixture covers `bulk_revert_process`
  (the harvest store only mentions the action from `tool_element_context`);
  the retired differential's TS twin is `tm_bulk_revert.test.ts`, updated
  above.

## Residual

A6's exemption map is a RATCHET on a measured leak class, not a closure: the
admin-gated report surfaces (ontology import/export, the maintenance widgets,
the `tool_import_*` per-file reports, the update engine) still put raw
Postgres/fs text inside ok:true payloads, each entry naming its class. They are
a burn-down owned by their subsystems' passes.
