# WC-2026-08-29-tm-apply-value-confirm-label — the Time-Machine tool context carries a label the PHP oracle never had

- **Date:** 2026-08-29. The divergence itself landed 2026-08-27 in `431c7bfcef`
  (DATA-03, "a restore must not delete the languages it did not restore"); this entry is
  the ledger line that commit owed and did not write. Filed late, and the lateness is
  part of the record.
- **Decision:** DEC-12 (the gate exists — `test/parity/tool_element_context_differential.test.ts`
  is what caught it). The divergence is DELIBERATE: it is new UI copy for a confirmation
  step the PHP engine did not have.

## Shape before (PHP, and TS through 2026-08-26)

`get_element_context` for `tool_time_machine` returned a label set harvested from the
PHP engine. It contains no `apply_value_confirm_msg`, because PHP's apply-value path
asked for no confirmation naming what it was about to overwrite.

## Shape now (TS)

`tools/tool_time_machine/register.json` declares `apply_value_confirm_msg` in every
shipped language. The TS tool context therefore emits one label the frozen fixture does
not, and the differential reports 11 extra entries (one per language).

The copy exists because DATA-03 changed what a restore DOES. A Time-Machine restore of a
translatable component now merges the restored language slice instead of replacing the
whole component, and the two behaviours are not distinguishable from the button: the
operator needs to be told, before the write, that this component keeps its other
languages and any other component is replaced whole. A destructive action whose blast
radius changed silently is the thing a confirmation exists for.

## Why this is a divergence and not a defect

The oracle is decommissioned and a re-harvest is impossible by definition (AGENTS.md,
THE VERIFICATION STORY), so a label added after the final harvest can only ever appear
as a differential red. The alternatives were: drop the confirmation (ship a changed
destructive behaviour with no notice), or add the label and record the divergence. The
second is the only one compatible with the premise.

## HOW IT STAYED INVISIBLE FOR TWO DAYS — the finding worth more than the entry

The tools register is seeded into the suite database by `bun run test:db:setup`. A local
database built before 2026-08-27 carries the OLD register, so the differential kept
comparing a stale tool context and stayed green. It surfaced only when the suite fixture
was rebuilt on 2026-08-29 during the P0-1 floor work.

Two consequences, both now recorded in `audits/2026-08-26_deep/raw/batch6_results.md`:

1. **`engineering/parity_baseline.json` was frozen against a drifted local database, not
   against the reproducible fixture.** Anyone running `test:db:setup` and then the parity
   tier saw two drifts (this gate newly red; `tools_register_differential` newly PASSING,
   because the rebuild put the register back in sync with the repo). CI builds the
   database from scratch on every run, so the parity stage added to `scripts/ci/db_tier.sh`
   in this batch would have failed on its very first CI execution. The baseline is
   re-frozen against the clean fixture in the same change as this entry.
2. **A parity baseline is a function of the FIXTURE as well as the code**, and nothing
   said so. Re-freezing it after a `test:db:setup` is now the documented expectation, not
   a surprise.
