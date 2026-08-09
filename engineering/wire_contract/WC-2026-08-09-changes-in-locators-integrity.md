# WC-2026-08-09-changes-in-locators-integrity — changes_in_locators advances the destination counter, moves the Time Machine tail, and reports malformed items

- **Date:** 2026-08-09 (defect ledger D1 / D2 / D3, the CRAP Population B pass).
- **Decision:** — (DEC-12 gate: `test/unit/transform_locators_native.test.ts`;
  the D1 pin is FLIPPED in place, D2 gets new cases, and the D3 case that used
  to assert `errors: []` now asserts the reported refusals.)
- **Relation to WC-025:** WC-025 enumerates what each move_* executor does
  against the split schema. This entry AMENDS the `changes_in_locators` half of
  that enumeration with the counter write and the matrix_time_machine tail; the
  rest of WC-025 stands.

`move_locator` is an UPDATE_PROCESS phase 5 transform, reachable only through
the global-admin maintenance widget (`dispatchWidgetRequest` gate 1,
`src/core/area_maintenance/widgets/registry.ts`). All three changes are on the
STORED RECORD and on the widget's report envelope; none touches a read path.

---

## D1 — the destination counter is now ADVANCED (a deliberate divergence from PHP)

### What was wrong

`executeChangesInLocators` read the destination counter once per entry
(`base = await counterValue(newTipo)`), offset every moved `section_id` by it,
and never wrote it back. Nothing in the file touched `matrix_counter`.

The ledger's original framing — "the next `createSectionRecord` re-issues
colliding ids" — is WRONG and is corrected here: `insertMatrixRecordWithCounter`
(`src/core/db/matrix_write.ts`) inserts `ON CONFLICT (section_id, section_tipo)
DO NOTHING`, detects the empty `RETURNING`, realigns the counter to
`MAX(section_id)` and retries once (the S2-01 self-heal). Measured: an ordinary
create after a move printed one `console.error` and returned a fresh id — no
collision, nothing overwritten.

The real damage is a SECOND entry into the SAME destination (two definition
files, or two lines of one — the `rsc194→rsc197` beside `rsc182→rsc176` pattern
of the PHP tree). Both entries re-read the same never-advanced base, so their
offset id ranges overlap; the phase-1 `UPDATE` hits
`UNIQUE (section_id, section_tipo)` and throws; and because
`executeChangesInLocators` has NO transaction and no per-item catch, the section
is left PARTIALLY MOVED — some allowlisted tables re-keyed and committed, the
rest not, the jsonb locator rebase never run, and no Time Machine trail to
restore from. Recoverable only by hand-written SQL.

### Shape after (TS)

After phase 1 of each entry, and BEFORE the next entry reads its base:

    INSERT INTO matrix_counter (tipo, value) VALUES ($newTipo, $highest)
    ON CONFLICT (tipo) DO UPDATE SET value = GREATEST(matrix_counter.value, EXCLUDED.value)

where `$highest` is `MAX(section_id)` of the destination tipo across exactly the
tables the move touched. `GREATEST`, never a plain `SET`: a counter must never
go down, and two runs converge. The delta is reported as
`{op: 'advance_counter', table: 'matrix_counter', target: <newTipo>,
detail: 'value ≥ <n> (was <base>)'}`. The dry run PREDICTS the value
(`MAX(section_id)` of the SOURCE tipo plus the base) and writes nothing.
`matrix_counter_dd` is never touched — no `_dd` table is in play here.

### Reason — and why this is NOT a parity claim

The PHP oracle does not advance the counter either: `changes_in_locators`
(`core/base/upgrade/class.transform_data.php:1649-1657`) only READS
`counter::get_counter_value` per entry. This is therefore a DELIBERATE
DIVERGENCE from the oracle, argued as a correctness fix, not as parity: the
counter's whole contract is "the last id handed out for this tipo", and a
transform that consumes ids up to `base + max` without saying so leaves that
contract false — silently, until the next transform in the same upgrade run
trips over it and half-moves a section.

---

## D2 — the matrix_time_machine tail moves with the section (a parity RESTORATION)

### What was wrong

Both phases iterated `MATRIX_TABLE_ALLOWLIST` only, and `matrix_time_machine` is
deliberately absent from that list (it does not carry the standard record's
columns). No other statement in the file named it. Measured on scratch rows: a
matrix row moved from `(zzdlocsrc1, 910901)` to `(zzdlocdst1, 1821801)` while
its TM row still read `(zzdlocsrc1, 910901)` — coordinates that no longer exist.

Every moved record's entire audit trail was orphaned: the TM UI's history, diff
and restore all silently showed nothing, while the old rows sat unreachable
under a dead `(section_tipo, section_id)`. Nothing was deleted, so it was
recoverable in principle — but only by an operator writing the same offset
arithmetic by hand, and only while they still knew the old tipo and the base.

This was a PORT OMISSION, not a design choice: PHP passes `matrix_time_machine`
in `$ar_tables` (`core/area_maintenance/widgets/move_locator/class.move_locator.php:173-192`)
and its row callback re-keys the TM `section_tipo`/`section_id` like any other
table (`class.transform_data.php:1700-1760`).

### Shape after (TS)

In the same pass, with the SAME `base`, immediately after the allowlist sweep:

    UPDATE matrix_time_machine SET section_tipo = $new, section_id = section_id + $base
    WHERE section_tipo = $old

reported as an ordinary `op: 'update'` delta on table `matrix_time_machine`; the
dry run reports the matching count and writes nothing. In phase 2, TM's single
payload column (`data`) is passed EXPLICITLY to the locator rebase, since
`MATRIX_JSONB_COLUMNS` describes the standard record and not TM.

`MATRIX_TABLE_ALLOWLIST` is deliberately NOT widened: it is the identifier gate
for the standard record contract, consumed by `assertMatrixTable` and by every
matrix reader/writer, and widening it would let generic code project columns TM
does not have. TM is handled as a NAMED exception, exactly as `tipos.ts`
(`renameColumn('matrix_time_machine', …)`) and `portalize.ts`
(`planTmRelocations`) already do.

**Idempotence is NOT claimed.** Re-running the whole transform is already unsafe
(the offsets are cumulative); the TM statement is deliberately not made to look
idempotent when the primary move is not.

---

## D3 — a malformed section item is REPORTED, not silently dropped

### What was wrong

    items.filter(item => item.type === 'section'
        && TIPO_RE.test(item.old ?? '') && TIPO_RE.test(item.new ?? ''))

with no `recorder.error` on any dropped item — unlike `tables.ts` and `lang.ts`,
which both report. Measured: three items in one call (one valid, one with
`old: 'BAD TIPO'`, one with `new: 'NOT_A_TIPO'`) produced `errors: []` and
`counts: {update: 1}` — a report byte-indistinguishable from a clean
single-entry file.

Nothing is corrupted; the harm is procedural and it compounds. An operator whose
definition line has a typo reads a green report, believes the section moved, and
proceeds to the next phase of the upgrade (`perform: ['move_tld']`, the add_data
hooks, the follow-up portalize) against a section that was never moved.

### Shape after (TS)

The widget response's `errors` array gains one line per refused item:

    changes_in_locators: invalid item <old>→<new>

The batch is not aborted — the valid entries still run. `type: 'component'`
items stay SILENT: they are legitimate content of a real `move_locator`
definition file, are handled by `move_tld` (`tipos.ts`), and PHP filters them
the same way (`class.transform_data.php:1640-1642`); reporting them would flood
every real run with false errors. An item with any OTHER `type` value is
likewise skipped silently, for the same reason.

---

### Gate reconciliation

**No fixture re-harvest.** No read path changes shape: these are write-path
transforms plus the maintenance widget's own report envelope, and the frozen
oracle store contains no move_locator run.

Gated by `test/unit/transform_locators_native.test.ts` (scratch tipos `zztloc*`,
`matrix_test.section_id` 901000-901999, counter `zztlocmvb1`, and the TM tail —
all swept and asserted to zero in `afterAll`): the counter lands on the top id
consumed and is reported, in execute and as a dry-run prediction; a TM row of
the moved section re-keys with the same base while a TM row of a different
section stays byte-identical, with the dry run predicting and writing nothing;
and the malformed-items case asserts the two errors (the empty destination and
`'ZZTLOC MVB1'`) with the `type: 'component'` entry silent, plus that an invalid
item does not abort the batch.
