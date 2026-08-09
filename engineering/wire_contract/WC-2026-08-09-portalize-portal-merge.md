# WC-2026-08-09-portalize-portal-merge — portalize_data merges the portal key instead of replacing it

- **Date:** 2026-08-09 (defect ledger D6, the CRAP Population B pass).
- **Decision:** — (DEC-12 gate: `test/unit/portalize_plan_native.test.ts`,
  sections 5, 8 and 9 — the pin that recorded the clobber as "pinned, not fixed"
  is FLIPPED in place and now asserts the clobber is gone.)

### What was wrong

`src/core/update/transform/portalize.ts` step 2 wrote

    updateMatrixKeysData(sourceTable, source_section, sourceId,
        [{ column: 'relation', key: item.portal, value: [portalLocator] }])

— an UNCONDITIONAL REPLACE of the source record's portal key. Anything the
portal already held (locators to records portalized in an earlier run, or
links an operator put there) was destroyed. The write is `save_tm` suppressed
by design (a transform relocates history, it does not snapshot it), so there is
no Time Machine row to restore from: the loss is permanent.

Two neighbours of the same defect: two moves claiming one
(`column`, `target_tipo`) — a component tipo present in two columns, or two
source components mapped onto one target tipo — nested into the same
`updateMatrixKeysData` call, so the LAST one won and the loser's value was
discarded on the target while its source key was still nulled; and a single
malformed jsonb column threw out of `JSON.parse` and aborted the whole
transform, with earlier rows already written.

### Shape before (TS, until 2026-08-09)

    source.relation[portal] = [ {new record} ]          // whatever was there is gone
    target.<col>[target_tipo] = last colliding move     // order-dependent
    one corrupt column                                  → the run stops mid-write

### Shape after (TS)

**Portal write — read then merge** (`planPortalWrite`, `portalize_plan.ts`):

| existing `relation[portal]` | written |
|---|---|
| absent / SQL-null / JSON null | `[locator]` — the single-move happy path, byte-identical to before |
| an ARRAY not containing this locator | `[...existing, locator]` — appended LAST, existing content and order preserved |
| an ARRAY already containing it | **nothing is written at all** (`skip`) |
| anything else (scalar/object) | the ROW IS REFUSED and reported before anything is created; nothing is written |

Locator identity for the already-present test is
(`section_tipo`, `section_id`, `from_component_tipo`) via `compareLocators`
(so `type` and `section_id` string/int drift do not manufacture a duplicate).

**Idempotence.** A completed run leaves the moved source keys REMOVED, so a
second run collects no moves for that row and touches nothing. The merge is the
belt to that brace: replaying a portal value through `planPortalWrite` a second
time yields `skip`, so a re-run can never duplicate the locator — which is
exactly why plain "append" was refused when this defect was first pinned.

**Collision law — FIRST move in plan order WINS**, deterministically from the
INPUT alone (component order, then `MATRIX_JSONB_COLUMNS` declaration order —
never row or DB iteration order). The losing move is neither written to the
target NOR nulled on the source: its data stays where it is, recoverable, the
collision is reported through the transform recorder's error channel, and that
component's Time Machine history is NOT relocated either (its data never moved).
A single source tipo fanned to two DIFFERENT target tipos is not a collision:
both are written, the shared source key is nulled once.

**Per-row failure isolation.** The five write steps of one row
(create → write flat data → link portal → null source → relocate TM) now run
inside ONE `withTransaction`, and a `JSON.parse` failure on a row's columns is
caught, reported and skips that row. A run can no longer stop with the data
duplicated into the new record but the source not yet nulled, nor abort the
whole transform because one column is corrupt.

### Reason

The consumer here is the STORED RECORD, not a client payload: `portalize_data`
is an UPDATE_PROCESS phase 5 transform that runs unattended over a whole
section during an upgrade. A blind replace on a TM-suppressed write is the one
class of bug this codebase cannot recover from afterwards, and "the portal was
probably empty" is an assumption about customer data, not an invariant. The
transform now never destroys what it did not create; where it cannot merge
safely it refuses the row and says so.

The dry-run report (`op: link_portal`) states the merged locator COUNT, and a
skip states the reason, so an operator sees a merge happening rather than
inferring it.

### Gate reconciliation

**No fixture re-harvest.** Nothing on any read path changes shape: this is a
write-path transform with no PHP-facing response. The frozen oracle store
contains no portalize run.

Gated by `test/unit/portalize_plan_native.test.ts`: the merge table above
(append preserves existing content and order; two-run replay writes nothing the
second time; identity ignores `type` and compares `section_id` loosely;
non-array refuses), the collision law in both mapping orders (including that the
loser is NOT nulled), the TM-relocation drop, and — on a scratch row
(`matrix_test`, `section_tipo='test3'`, `section_id=941008`, component tipo
`zzpportsrc1`) — that a row whose portal holds a scalar comes out of
`portalizeOne` byte-identical with one recorded error and zero ops.
