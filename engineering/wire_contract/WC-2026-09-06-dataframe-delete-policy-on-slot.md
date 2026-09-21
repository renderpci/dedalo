# WC-2026-09-06-dataframe-delete-policy-on-slot — the dataframe delete policy is the SLOT's, has a hard value, fires on both delete doors, and `hard_delete: true` is read

- **Date:** 2026-09-06.
- **Decision:** the project premise (the structurally right home for a fact) +
  the user's own: "I don't want to remove the property in ontology" — the 59
  legacy `hard_delete` slot nodes are honoured, not migrated. DEC-12 gate:
  `test/unit/dataframe_delete_policy_native.test.ts`.

## The divergence in one line

PHP `trait.dataframe_common::get_dataframe_delete_policy()` read
`properties.dataframe.delete_policy` from the MAIN component (`$this->tipo`),
knew one opt-in (`delete_target`, soft), and consulted it on ONE door (the
main-item cascade `remove_dataframe_data_by_id`). The TS engine reads the policy
from the **dataframe slot node**, knows a hard value, honours the v6
`hard_delete: true` spelling, and applies it on BOTH doors.

## What was wrong

- **Wrong node.** The reader looked at the main; the docs, the resolver's
  retired-key tripline and every one of the 59 legacy nodes put the key on the
  slot. Measured 2026-09-06: **zero** nodes on the vendored ontology and zero
  on the `monedaiberica` install carry `dataframe.delete_policy` anywhere —
  the opt-in existed and no one could find where to write it.
- **One door only.** The dataframe modal's own Delete button unlinks the frame
  through `action:'remove'` on the SLOT; that reaches `removeDataframeDataById`
  with the slot as "main", which finds no dataframe slots in a slot's
  request_config and returns. So a curator deleting a frame never triggered
  the policy, whatever it said.
- **Soft only.** `hard_delete` — the v6 opt-in whose intent was the record's
  removal (`delete_linked_record`, `delete_mode: 'delete_record'`) — had NO
  reader in v6 either: the client branch shipped commented out. 59 slot nodes
  carried a promise nobody kept.

## Shape after (TS)

On the **slot node's** `properties`:

| declaration | policy | effect on the frame target, AFTER its locator has left the slot |
|---|---|---|
| `"hard_delete": true` | `delete_target_record` | `deleteSectionRecord`: Time Machine snapshot, row removed |
| `"dataframe": {"delete_policy": "delete_target_record"}` | `delete_target_record` | same — the spelled form for new nodes |
| `"dataframe": {"delete_policy": "delete_target"}` | `delete_target` | `deleteSectionData`: row kept, components emptied |
| anything else | `unlink` | the target survives |

`hard_delete: true` wins over a conflicting `delete_policy`. A policy on the
MAIN node is ignored. Reader: `dataframeDeletePolicyOf`; applier:
`applyDataframeDeletePolicy` (`src/core/relations/dataframe.ts`). Doors:
`removeDataframeDataById` (`src/core/relations/save.ts` — main-item removal,
`deletePortalLocator`, whole-record inverse cleanup) and the `remove` branch of
`saveComponentData` on a `component_dataframe` slot
(`src/core/section/record/save_component.ts`). On every door the targets are
collected from the raw stored entries BEFORE the strip; the deletes are queued
on the commit lane and run only AFTER the enclosing transaction commits, each
in its own transaction (see "When the target is touched" below).

**Four doors**, not two: the whole-record delete of the host in BOTH modes
(`deleteSectionRecord` and the soft `deleteSectionData` → `applyOwnFramePolicies`)
applies each slot's policy to its own frames as well — the same ontology may
not orphan its ratings because the curator deleted the coin instead of the
valuation, nor because of which delete mode was picked.

**The write grant on the frame target section is asked.** Every door is
authorized on the HOST (the slot component's level, or the host section's),
and no request names the frame target's section; the applier therefore asks
`getSectionPermissions(principal, target section) >= 2` itself, before
anything is queued and inside the caller's transaction, and refuses the whole
request with `perm.denied` (the duplicate door's re-mint shape). Level 1 on
`rsc1242` does not delete ratings through the modal.

**When the target is touched.** Every door runs inside an ambient transaction,
and a target delete never shares it: `deleteSectionRecord`'s media move and
diffusion unpublish are irreversible and are post-commit only when the delete
owns its transaction. So `applyDataframeDeletePolicy` queues the deletes on the
COMMIT-ONLY lane (`registerCommitAction`): they run after the unlink has
COMMITTED, each in its own transaction; on ROLLBACK the queue is discarded and
the unlink and the target both come back. A target delete that still fails after
commit is logged and leaves an orphan (reclaimable by maintenance), never a
dangling locator and never a poisoned transaction, and the remaining targets
still go (gated by failure injection) — it cannot reach the wire, since the
response envelope was built by then: the client grammar is "unlinked; the
target's deletion follows the commit". The soft host delete applies the
policies of the slots it EMPTIED only: a dd490 bag stored under a tipo the
section's subtree no longer reaches keeps its key, and a target deleted under
a surviving locator is the state this entry forbids. `deleteSectionData` (the
soft path) now runs its read + per-component writes + stamps in ONE
transaction (it used to autocommit each statement, so a mid-loop failure left
a half-emptied record); its save event is the write chokepoint's, fired per
key on the post-transaction lane. A save REFUSED with `ok:false`
runs no cascade: the batch's removes cascade only after every change applied
and the component was written (`cascadeAppliedRemoves`), because an `ok:false`
result commits what already ran, and a valid remove ahead of a later refused
change had already stripped the slot and queued a target delete.

**What a policy may reach.** A stored dd490 entry whose `section_id` is not a
record address (an unswept legacy string that does not convert, an external
id) owns no record: it is left alone under every policy and a log line says
so. A legacy numeric string converts (`canonicalizeStoredSectionId`).

**One reader, served to the client.** The slot's resolved policy is emitted on
every `component_dataframe` structure-context entry as the ADDITIVE wire key
`delete_policy` (`'unlink' | 'delete_target' | 'delete_target_record'`). The
client (`view_default_list_dataframe.js`) deletes nothing itself and never
re-reads the properties; under `delete_target_record` it asks a second
`confirm`, the portal's "delete resource and all links" grammar.
`component_common/js/dataframe.js delete_dataframe` selects the stored frame
entries by their PAIRING (`id_key` + `main_component_tipo`, entries carrying an
`id`) — it used to pass a locator with no `id`, which the save path's `remove`
cannot match, so the button removed nothing.

## Consequence on live installs — stated, not hidden

Every install carrying the numisdata `hard_delete` slots (59 nodes measured
on the `monedaiberica` install on 2026-09-06; the vendored test ontology
carries 54) (the valuation
rating frames `numisdata1447`, `numisdata1507`, … → `rsc1242`) changes
behaviour on update: deleting such a frame, or removing the valuation it
qualifies, now deletes the `rsc1242` record. Recoverable from Time Machine
(`deleteSectionRecord` snapshots first). This is the behaviour the ontology
author wrote in v6; it is live for the first time.

`hard_delete` leaves `RETIRED_PROPERTY_KEYS` and joins `HONOURED_PROPERTY_KEYS`
(`src/core/ontology/property_census.ts`); the resolver no longer reports it.
