# WC-2026-08-14-tm-permission-floor — dd15 permission floor derives from the `time_machine_list` grant

- **Date:** 2026-08-14. Adopted with the Time Machine unification (S1).
- **Decision:** DEC-15; `SECTION_SPEC.md §7.4`.

## Shape before (PHP / TS-before)

Two rules in the engine disagreed, and never collided because the TM read
never consulted the first:

- `src/core/security/permissions.ts:390` — a wrapper rule: any column whose
  parent tipo is `dd15` resolves to `isGlobalAdmin ? 1 : 0`. **Global admins
  only.**
- `canAccessTimeMachineList` (`section/list_definitions/time_machine_list.ts`),
  per `SECTION_SPEC.md §7.4` — a section declares a `time_machine_list` child,
  and a principal holding a grant on it reads that section's history.
  **Per-section, non-admins included.**

They did not collide because the TM read never ran dd15 columns through the
generic per-ddo authz loop: `buildTmContext` handed back a synthesized context
with `permissions` hardcoded to `1`, and the client re-stamped every ddo to
`permissions:1` on its side too.

`permissions.ts:73` also carried a LOCAL duplicate `const TIME_MACHINE_SECTION =
'dd15'` alongside the canonical constants in `db/time_machine.ts` and
`concepts/section.ts`.

## Shape after (TS)

The wrapper rule is replaced by an **ACL-derived floor**:

- a principal holding the `time_machine_list` grant on the **scoped** section
  gets read level 1 on dd15 columns;
- a global admin keeps level 1 unscoped;
- otherwise 0.

The local duplicate constant at `permissions.ts:73` is removed so the
`log_section_policy_tripwire` grep can see the site.

### The browse / scoped split

The bare dd15 browse (`?tipo=dd15&mode=list`, `tm_scope.kind === 'browse'`)
shows **every section's history at once**, so a per-section grant cannot
authorize it: it stays **global-admin only**. The per-section grant authorizes
the SCOPED surfaces — `tool_time_machine` (section and component callers) and
the inspector's record/component history — where the read is filtered to the
one section the user already has access to.

## Reason

Once dd15 is read through the generic pipeline, the per-ddo authz loop
(`read.ts`) runs for real. Under the old wrapper rule it would filter every
column to nothing for exactly the non-admin users the §7.4 grant exists to
serve — and the parity fixtures replay as an internal principal, so no existing
gate would have caught it.

Stated as the owner's intent (2026-08-14): a user with access to a section where
Time Machine is invoked (oh1, oh25, rsc36 …) reads **that section's** history
inside the tool — a filtered view of the Time Machine records, never the whole
table. The wrapper rule was the contradiction; §7.4 is the rule.

## Gate reconciliation

New TS-native gate `tm_permission_floor_native`: a non-admin **with** the grant
on a section reads a non-empty scoped list; **without** it, refused; a non-admin
is refused the unscoped browse. Landed in S1 with NO wire change (the emitter
still owned emission at that point), so the permission change is isolated from
the emit change for bisection. Companion:
`WC-2026-08-14-tm-scope-server-owned`, which supplies the scope this floor is
evaluated against.
