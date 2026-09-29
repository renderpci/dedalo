# WC-2026-09-29-dataframe-hard-delete-retired — no delete policy removes a dataframe frame target row; `hard_delete: true` is inert again

- **Date:** 2026-09-29.
- **Decision:** the user's: "this behaviour is not defined by the ontology with
  `hard_delete: true`. Review was wrong." Soft opt-in kept, hard value removed.
  Corrects `WC-2026-09-06-dataframe-delete-policy-on-slot` (see its addendum).
  DEC-12 gate: `test/unit/dataframe_delete_policy_native.test.ts`.

## What was wrong with the 2026-09-06 entry

It read `hard_delete: true` as the hard policy `delete_target_record`, on the
premise that the key was "inert since v6 … a promise nobody kept". The v6
code states the opposite. In `core/component_common/js/component_common.js`
`delete_dataframe` it says: `// REMOVED because time machine needs to show the
previous state, so, never deletes it`. The key was retired on purpose. A past
state of a main renders its frame THROUGH the frame target, so a target row
removed from the matrix makes Time Machine show a history with holes in it.

Measured on the dev copy: removing a frame from `numisdata32` on `numisdata3/1`
(slot `numisdata251`, `hard_delete: true`, target `rsc1242`) removed
`rsc1242/582` and `rsc1242/584`.

## Shape before (PHP)

`trait.dataframe_common::get_dataframe_delete_policy()` knew one opt-in,
`dataframe.delete_policy: "delete_target"` (soft), and no hard value.
`hard_delete` had no reader: the client branch was commented out WITH the
reason above.

## Shape after (TS)

`dataframeDeletePolicyOf` (`src/core/relations/dataframe.ts`) answers
`'unlink' | 'delete_target'`, and nothing else:

| declaration on the SLOT node | policy | effect on the frame target |
|---|---|---|
| `"dataframe": {"delete_policy": "delete_target"}` | `delete_target` | `deleteSectionData` after COMMIT: components emptied, **row kept** |
| `"hard_delete": true` | `unlink` | none — retired key (`RETIRED_PROPERTY_KEYS`, the resolver tripline names it) |
| `"dataframe": {"delete_policy": "delete_target_record"}` | `unlink` | none — the TS-only hard value is withdrawn |
| anything else | `unlink` | none |

- `applyDataframeDeletePolicy` calls `deleteSectionData` only. No dataframe
  door reaches `deleteSectionRecord` for a frame target.
- Everything else in the 2026-09-06 entry stands for `delete_target`: the slot
  as the one home, the four doors, the commit lane, the target-section write
  grant, the deferred batch cascade.
- The structure-context key `delete_policy` stays additive, with the two values
  above.
- The client's second confirm (`needs_double_confirm`) is removed. It existed
  only for the hard value.

## Consequence on installs

The numisdata slots carrying `hard_delete: true` unlink again, as in v6: 46 of
the 54 slots in the vendored test ontology that carry the key (the other 8 carry
`false`, which was always an unlink), and 48 of 59 on the dev copy. The
resolver tripline reports each node that carries the key once per process,
with no replacement: the key is removed, not converted. `delete_target` is a
separate opt-in, for frame-PRIVATE targets only. Frame targets
removed between the 2026-09-21 landing and this entry can be recovered from
their Time Machine `deleted` snapshots (tool_time_machine undelete).

## Bulk-revert consequence

The undo log's role-4 whole-record cascade twin (WC-2026-09-27-bulk-revert-undo-log)
no longer has a producer in a run's own dataframe cascade: a cascade keeps the
row (a soft wipe), and only a REVERT's own D2 delete of a born record removes a
row under a bulk id. The revert machinery that undeletes, couples and epoch-checks
missing rows is still reachable through revert-of-revert. Its gates were
re-pointed at that producer. Two scenarios have no producer left, and their
tests were deleted: an inverse locator stripped by a cascade record delete,
and a nested row-deleted child. The "born record gone" rule (a run's role-4
marker of a record that is now gone is dropped, never undeleted) is re-pointed
too: the run wipes its own born record softly, and a curator deletes it
afterwards.

## Gate reconciliation

No parity fixture is involved: `delete_policy` is additive, and PHP never
served it. `dataframe_delete_policy_native` pins every door under both
retired spellings as "target survives, no `deleted` snapshot": the main-item
and direct doors, the whole-record door in both modes, and the portal-target
inverse door. Mutation-proved against the 35-test gate:
- restoring the `hard_delete` read → 28/7;
- bypassing the commit lane → 33/2.
