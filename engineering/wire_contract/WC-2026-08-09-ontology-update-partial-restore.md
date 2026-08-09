# WC-2026-08-09-ontology-update-partial-restore — a failed ontology import stops claiming "previous state restored" when it cannot be true

- **Date:** 2026-08-09 (CRAP defect-ledger D7).
- **Decision:** — (DEC-12 gate:
  `test/unit/ontology_update_restore_message_native.test.ts`, which pins both
  branches of `restoreFailureMessage`; `WC-023` remains the owning entry for the
  `update_ontology` owned-mode/target refusals.)

### Shape before (TS, until 2026-08-09)

Every failure branch of `updateOntology`'s Phase C — and the outer `catch` —
set the same message:

    Error. Import failed — previous state restored

That statement is FALSE for every non-`matrix_dd` TLD. Phase B snapshots
`matrix_ontology` (tipo-scoped) and `matrix_dd` and NOTHING else, while Phase C
provisions, BEFORE the row import of each TLD:

- a `matrix_ontology_main` registry record (`addMainSection`) — and for an
  ALREADY EXISTING tld it reuses the row and unconditionally overwrites its
  registry components (project filter, `active_in_thesaurus`, lang, active,
  name) with defaults;
- the `<tld>0` `dd_ontology` root node and its `ontologytype` grouper
  (`createDdOntologyRootNode`).

Both go through `updateMatrixKeyData` — raw matrix writes with no Time Machine
trail — so `restoreSnapshots` cannot revert them and no TM row exists to recover
from. After a failed update the install carried a half-provisioned TLD while the
operator was told the database was back to its previous state.

### Shape after (TS)

The message is now a function of what was actually provisioned
(`restoreFailureMessage`, `src/core/ontology/ontology_update.ts`):

| case | `msg` | `errors` |
|---|---|---|
| nothing provisioned (failure on the first `matrix_dd` file, or before any TLD was provisioned) | `Error. Import failed — previous state restored` — **unchanged bytes**, and true | unchanged |
| one or more TLDs provisioned | `Error. Import failed — matrix rows restored; registry and dd_ontology state may be partial` | one ADDED line: `registry record (matrix_ontology_main) and dd_ontology root node NOT reverted for: <tld, …> — MANUAL REVIEW REQUIRED` |

`result` stays `false`, the restore itself is unchanged (still best-effort and
loud, still emitting `recovery snapshot missing for <tld> — MANUAL RESTORE
REQUIRED` per file it cannot restore), and the success path is untouched.

**Deliberately NOT done, and why.** The alternative fix — making the rollback
real by snapshotting the affected `matrix_ontology_main` row plus the `<tld>0`
`dd_ontology` subtree and having `restoreSnapshots` undo them — is a new
destructive write path (a restore must DELETE what did not previously exist)
on a pipeline that has no injectable table seam and therefore no way to be
exercised outside a real ontology import. Reordering the provisioning to run
after the import is blocked by the documented PHP step order (the import is
declared to run against an existing registry record + root node). Both are
larger than a defect fix and neither is safe to land untested against the
ontology tables; an honest message is a complete fix for the defect as stated
(the lie), and the residue is now NAMED in `errors` instead of hidden. The real
rollback stays open in the defect ledger.

### Reason

The consumer is the operator deciding whether to retry, restore from backup, or
hand-clean. "Previous state restored" tells them the database needs nothing;
that answer was wrong in exactly the case where acting on it costs most. A false
success claim is a worse wire contract than an accurate partial-failure one.

### Gate reconciliation

**No fixture re-harvest.** `update_ontology` is an operator-only write action
with no oracle fixture (the frozen store is read-path), and the OK-path bytes,
the refusal bytes (WC-023) and the unchanged `previous state restored` branch
are all preserved verbatim. The new message and the new `errors` line are gated
by the unit test named above.
