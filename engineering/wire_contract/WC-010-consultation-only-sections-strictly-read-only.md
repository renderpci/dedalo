# WC-010 — consultation-only sections are strictly read-only (TS hardens duplicate/delete beyond the oracle)

- **Date:** 2026-07-09 (user directive: Activity dd542 + Time Machine dd15 must
  be strictly read-only — "the user can never modify the information").
- **Context — mostly a parity FIX.** PHP already makes these sections read-only
  via three guards the TS engine had NOT all ported: the section-permission cap
  (`section::get_section_permissions:1929` → level ≤ 1 for dd542; dd15 is
  admin-only in `common::get_permissions`), the save refusal
  (`dd_core_api::save:1330` "Illegal save to activity", search_* excepted), and
  the create refusal (`section::create_record:452`). TS now mirrors all three:
  `getSectionPermissions` (permissions.ts) applies the cap and feeds the client
  read-only rendering + the create/duplicate/delete API gates; the save handler
  refuses with the search_* exception; the write engines
  (`create/duplicate/delete/saveComponentData`) backstop every door (client,
  MCP, agent). `getPermissions` is UNCHANGED (still a faithful mirror of
  `common::get_permissions`, which does NOT cap dd542 — the cap lives one layer
  up), so the `permissions_differential` contract is intact.
- **Shape before (PHP):** `duplicate` / `delete` gate on the UNcapped
  `common::get_permissions(section_tipo, section_tipo)` and carry no extra
  activity/TM guard. A misconfigured profile granting level ≥ 2 on dd542/dd15
  would let the PHP oracle duplicate or delete one of these records (success +
  new id / deletion).
- **Shape after (TS):** the same request is refused — a 403 at the API handler
  (section perm capped at 1) and a hard throw at the write engine — regardless
  of any grant. Registry: `CONSULTATION_ONLY_SECTIONS` in
  `src/core/concepts/section.ts` (add a tipo to extend the policy to a future
  section).
- **Client editability (the UI half).** The record read path stamps a COARSE
  per-request permission (`section/read.ts` + `resolve/read_tm.ts`: 3 for
  admins, 1 otherwise — the acknowledged "v0" cap, exact per-element propagation
  deferred). So an ADMIN saw every Activity/TM component as editable (e.g. the
  'Who' column dd132). The fix caps at the single context chokepoint
  `resolve/structure_context.ts::buildStructureContext`: every element emitted
  for a consultation-only section comes back `permissions ≤ 1`, so the client's
  `disabled_component` path fires (`ui.js:251`, permission < 2) and no
  admin-only affordance (perm ≥ 3) is attached. This is complemented by a cap AT
  THE READ SOURCE (`section/read.ts` + `resolve/read_tm.ts`): when the read
  TARGET is consultation-only the coarse per-request permission is capped at 1
  before it is threaded into the tree, so CROSS-SECTION portal subdatum children
  are covered too — e.g. the Activity 'Who' column's username `dd132`, whose own
  `section_tipo` is `dd128`/Users; `buildStructureContext` keys on the element's
  own section and would leave it at admin-3 (editable), but the source cap makes
  the whole subtree read-only. For a normal global admin this
  MATCHES PHP (PHP resolves the Activity component perm from the matrix, which
  grants ≤ 1 — admins are not auto-3, only the superuser is). It diverges from
  PHP ONLY for the superuser (user -1), whom PHP leaves at 3 (editable-looking,
  though its save is still refused). TS renders it read-only per the directive —
  strictly safer, and the superuser is the system/root account.
- **Why:** the directive is that these sections are *always* read-only; leaning
  on "no profile happens to grant write" (the oracle's posture) is the exact
  fragility being closed. Strictly safer; observably identical under normal data
  (no shipped profile grants write on dd542/dd15).
- **Gate reconciliation:** no differential gate reds — the emission differentials
  (`activity_read`, `tm_read`, `section_elements_context`, `read`) run as a
  non-admin, where the component perm is already ≤ 1 in both engines, so the cap
  is a no-op there; no parity gate mutates a real dd542/dd15 record
  (scratch-write hygiene forbids it), so the beyond-oracle write branch is never
  exercised against the live oracle. The invariant is pinned by the unit tripwire
  `test/unit/consultation_only_sections_tripwire.test.ts` (the section-perm cap,
  the `buildStructureContext` client-editability cap handed admin-level 3, and
  every engine refusal). `permissions_differential` gains a fidelity assertion
  that the cap lives ONLY in `getSectionPermissions`, never in `getPermissions`.
