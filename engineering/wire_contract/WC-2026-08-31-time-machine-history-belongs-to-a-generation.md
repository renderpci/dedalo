# WC-2026-08-31-time-machine-history-belongs-to-a-generation — a record's history is its own, not its address's

- **Date:** 2026-08-31, adopted with the change that closes the second half of
  audit row P0-14 (findings DATA-07, LIFE-01). The first half is
  `WC-2026-08-30-section-id-counter-is-a-high-water-mark`.
- **Decision:** DEC-12 (the invariant lands with its gate:
  `test/unit/record_generation_native.test.ts`). The divergence is DELIBERATE:
  PHP had no notion of record generation at all, so this is an ADDITION to the
  identity rules rather than a change to a PHP behaviour.

## The problem the counter half does not solve

`matrix_time_machine` keys history by `(section_tipo, section_id)` — the
address — and nothing else. The counter half stopped ids being re-minted GOING
FORWARD. It does nothing for an address where a re-mint ALREADY happened, and
it cannot fence a route outside the allocator.

There, the reborn record inherits the dead record's history: the Time Machine
panel lists the dead record's snapshots as the living record's own, and a
restore writes the dead record's values into it with `ok:true` — the identity
check was `(section_tipo, section_id, tipo)`, which a re-minted address
satisfies exactly.

## The discriminator is a TM id, not a clock

`matrix_time_machine.id` is a monotonic serial and is ALREADY the engine's
ordering for a record's history (`read_tm.ts`: "the TM id column only"). So a
record's generation is an id — an EPOCH — and its history is
`matrix_time_machine.id >= epoch`.

The timestamp column cannot serve, and this was measured rather than assumed:
both engines deliberately stamp repair rows 60 seconds in the PAST
(`duplicate_record.ts`, `delete_record.ts`, PHP `tm_record` `PT1M`), the clock
is `DEDALO_TIMEZONE` wall-clock with an ambiguous DST fold and 1-second
granularity, `created_date` is rewritten wholesale by the very restore this
guards, and 2,428 UTC-skewed rows still exist (CARRY-05). Any tolerance wide
enough to absorb the -60s rows re-admits a dead generation.

## Shape now

1. **A new TS-owned store**, `dedalo_ts_record_generation(section_tipo,
   section_id, epoch_tm_id)` — created by
   `install/db/migrations/0005_record_generation.sql`, and lazily by its own
   subsystem for the one caller that runs before any boot migration: the
   INSTALLER, which mints records while restoring its seed (the pattern
   `0001_baseline` names for exactly this class of table). The bootstrap memo is
   NOT latched from inside a caller's transaction: Postgres DDL is transactional,
   so a later ROLLBACK undoes the CREATE, and a latched memo would then claim a
   table that no longer exists — failing every create and every time-machine read
   in that process until it restarts.

   **No schema change to `matrix_time_machine`** — the largest object on a
   heritage install (a measured 50.5M rows / 46 GB on one), and a table the TS
   migrations lane may not `ALTER` at all.

2. **An epoch is opened at exactly ONE door**: `insertMatrixRecordWithCounter`,
   and only when the freshly minted address already carries history. The store
   is SPARSE — one row per actual rebirth.

3. **The other two insert doors deliberately open none**, and this is the subtle
   half of the rule:
   - `insertMatrixRecordWithExplicitId` — an explicit id is one the caller
     already believes belongs to this record (a fixture, an import, the S1-02
     lost-create race, a provisioned ontology node). Hooking it here SEVERED the
     canonical test3 playground records from their own history (measured, caught
     by `tm_deep_offset_flip`).
   - `updateMatrixRecord`'s upsert-INSERT branch — this is the Time Machine
     SECTION RESTORE resurrecting a deleted record, and the save path's
     lost-create race. Both are the same record CONTINUING: an undelete, not a
     rebirth. Opening an epoch would cut a curator off from the very history
     they asked to restore.

   The epoch rides the SAME statement as the birth (a `born` / `opened_epoch`
   CTE chain), so the row and its fence commit together. A second statement could
   be lost to a dropped connection after the row committed, leaving a reborn
   record permanently fenceless with no repair path.

4. **Enforced** at the dd15 panel (all four query shapes AND the count twin, so
   pagination cannot disagree with the rows), the restore's identity gate, the
   component TM preview, both `bulk_revert` reads, and the three backfill-write
   probes — the last of which matter in the OPPOSITE direction: a dead
   generation's rows there SUPPRESS the reborn record's own history instead of
   leaking one.

5. **Deliberately NOT enforced** on the counter-floor `MAX(section_id)` reads
   (`counterFloorExpression`, `hierarchy_import`, `data_io_import`). Dead
   generations are exactly what those exist to witness; filtering them would
   re-open the first half of P0-14. The two halves pull in opposite directions
   and both are right.

## The fence moves with the addresses it fences

Two transforms re-key `matrix_time_machine` addresses, and both now re-key the
epoch store in the same pass — otherwise the fence points at coordinates that no
longer exist, `recordEpoch` answers 0, and the dead record's snapshots come back:

- a section RENAME (`transform/tipos.ts`) — merge-then-drop, GREATEST on
  collision, the same shape as the counter carry;
- a section MOVE (`transform/locators.ts`) — the same `section_tipo` + `section_id
  + base` rebase applied to the epochs.

`transform/portalize.ts` deliberately does NOT: it RELOCATES a component's
history onto a new record, making those rows the destination's own, and it runs
during an upgrade FROM v6 where the store cannot yet hold a row.

## Grandfathering is the design, not an omission

An address with no epoch row has epoch 0 — ALL of its history. Every record on
every install keeps everything it has, with **zero backfill**.

That is not laziness: a re-minted rebirth and a legitimate same-id UNDELETE
leave byte-identical data. The v6→v7 upgrade's `remove_tm_created_sections`
purges birth markers, so a surviving `tipo = section_tipo` marker really is a
delete — but nothing records what happened at the address afterwards. Seeding
generations from the log would sever real curators from real history on a guess.

**This fences the future.** Histories already merged before it shipped stay
merged, and separating them would require evidence that was never recorded.

## Gate reconciliation

- New: `test/unit/record_generation_native.test.ts` — a fresh address opens no
  epoch; a reborn record's panel is EMPTY and fills only with its own writes;
  existing history is grandfathered; an undelete keeps its history; a restore
  from a dead generation is REFUSED (`request.invalid_options`, and the living
  record is not written); the counter floor still sees dead generations. Each
  verified by reverting the fix and observing the gate go red.
- New: `test/unit/tm_epoch_tripwire.test.ts` (hermetic tier; registered in
  `engineering/TRIPWIRES.md`, `scripts/verify.ts`, `scripts/ci/hermetic.sh`) —
  the narrowing is applied by hand at six statements across five modules, so it
  is censused: every `FROM`/`JOIN`/`UPDATE`/`DELETE` naming the table is either
  narrowed or carries a counted, reasoned exemption. It pins BOTH numbers per
  file, because a file-level check passes as soon as one statement narrows —
  a fifth query shape added to `read_tm.ts` without its narrowing would
  otherwise ship green.
- `test/unit/module_state_tripwire.test.ts` — the subsystem's bootstrap memo is
  allowlisted with its reason, alongside the same shape in `locks.ts` and
  `temporal_store.ts`.
- No parity fixture is affected and no re-harvest is needed: the frozen store
  holds READ responses captured on addresses that were never reborn, and epoch 0
  serves them unchanged.
