# WC-2026-08-09-move-to-table-self-move-refused — move_to_table refuses `source_table === target_table`

- **Date:** 2026-08-09 (defect ledger D4, the CRAP Population B pass).
- **Decision:** — (DEC-12 gate: `test/unit/transform_tables_native.test.ts`,
  `describe('executeMoveToTable source === target (defect D4 — FIXED 2026-08-09)')`
  — the three assertions that pinned the destruction are FLIPPED in place and
  now pin the refusal.)

### What was wrong

`src/core/update/transform/tables.ts` validated `source_section` against
`TIPO_RE` and both table names against `MATRIX_TABLE_ALLOWLIST`, but never
compared the two tables. An item naming the same table on both ends ran

    INSERT INTO "t" (cols) SELECT cols FROM "t" WHERE section_tipo = $1;
    DELETE FROM "t"                              WHERE section_tipo = $1;

inside one `withTransaction`. The INSERT duplicates every row of the section
into the same table; the DELETE — scoped by `section_tipo`, not by id — then
removes BOTH the originals and the copies.

**Measured, on scratch rows:** against `matrix_activity_diffusion` — the ONE
allowlisted matrix table with no `UNIQUE (section_id, section_tipo)`, only a
pkey on `id` (verified in both `dedalo_mib_v7` and `dedalo_mib_v7_test`) — three
seeded rows became ZERO, the transaction COMMITTED, `recorder.errors` was `[]`
and `recorder.counts` was `{insert: 1, delete: 1}`. The report told the operator
the move succeeded. These transforms write no Time Machine trail by design
(WC-025), so there is no restore path short of a database backup.

On the other 22 allowlisted tables the unique index aborts the self-INSERT — but
that was never a safety net, only a different failure: a raw `PostgresError`
escaped `executeMoveToTable` (the per-item loop has no catch), `recorder.errors`
stayed empty, and `runTransform`'s per-FILE catch silently dropped every
remaining item of that definition file.

### Shape before (TS, until 2026-08-09)

    dry run   errors []            counts {insert:1, delete:1}   ← promises a move
    execute   errors []            counts {insert:1, delete:1}   ← section destroyed
              (or: raw PostgresError escapes, rest of the file dropped)

### Shape after (TS)

    dry run   errors ["move_to_table: refused self-move <tipo> <t>→<t>
                      (source and target table are the same)"]
              counts {}   sample []
    execute   identical — refused in the identifier gate, before any SQL;
              nothing thrown, so the remaining items of the file still run.

The check lives in a new `validateTableMoveItem(item): string | null` helper
alongside the existing identifier gate, so dry run and execute are refused by
the same one statement and cannot drift. The pre-existing
`move_to_table: invalid item …` message is byte-unchanged for the identifier
failures; the self-move gets its own message so an operator can tell a typo'd
table name from a same-table line.

**Deliberately NOT changed:** the INSERT-before-DELETE statement order and the
`withTransaction` wrapper both stay (the order is the live guard on the target
collision case), no Time Machine write is added (WC-025 pins TM suppression for
transforms), and the `count === 0 → continue` silent short circuit stays. No
per-item `try/catch` was added: it would swallow the target-collision
`PostgresError` that `test/unit/transform_tables_native.test.ts`'s "target
collision" case deliberately pins as escaping, and that escape is a separate
contract question from D4.

### Reason

The consumer is the STORED RECORD, not a client payload: `move_to_table` is an
UPDATE_PROCESS phase 5 transform run unattended over a whole section during an
upgrade, from a JSON file an operator hand-edits. A self-move is never a
meaningful instruction, so refusing it costs nothing and removes the engine's
one measured path to a committed, unrecoverable section deletion that reports
success.

### Gate reconciliation

**No fixture re-harvest.** Nothing on any read path changes shape — this is a
write-path transform with no PHP-facing response, and the frozen oracle store
contains no move_to_table run.

Gated by `test/unit/transform_tables_native.test.ts`: the refusal in dry run and
in execute (rows intact on both ends, nothing thrown), and that a refused item
no longer aborts the batch — the valid sibling item still moves
(`{insert: 1, delete: 1}`, target count 1).
