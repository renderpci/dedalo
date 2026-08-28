# WC-2026-08-28-export-gate-b-refuses-unresolvable-segment — an export ddo segment the gate cannot resolve is REFUSED, not exported

- **Date:** 2026-08-28 (deep audit 2026-08-26, finding SEC-01 (S1) + GATE-24;
  remediation row P0-15 — it re-opened TOOLS-02, which the 2026-07-28 security
  audit had recorded as FIXED).
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (the tripwire lands in
  the same change: `test/unit/export_gate_b_native.test.ts`).

## What diverges

`tool_export.get_export_grid` applies an authorization the PHP oracle never had.
The oracle gated the export on the DECLARED `options.section_tipo` only and then
emitted whatever ddo paths the request named — including components of sections
the caller holds level 0 on. The TS engine re-applies the read path's two gates
before it reads a record (`src/diffusion/export/grid.ts`): **Gate A** on every
SQO target section, **Gate B** on every exported ddo-path segment. Global admins
are exempt, by design.

Gate B itself is not new (it landed with TOOLS-02 on 2026-07-28, unledgered).
What changes today is the shape of the input it can be defeated with.

## Shape before (PHP, and TS from 2026-07-28 to 2026-08-27)

Gate B ran only inside
`typeof seg.section_tipo === 'string' && typeof seg.component_tipo === 'string'`,
so a segment whose `section_tipo` was **absent, null or ARRAY-shaped** was
SKIPPED — never refused — while every consumer resolved it anyway
(`compile_columns` maps a non-string to `''`, which the resolver reads as "no
section whitelist"; `resolveRecordAtoms` never reads the declared section;
`buildEntries`' record guard reads the first step's section with explicit array
tolerance). Executed on the suite fixture: a principal holding **level 0** on
`test3.test91` posting
`ar_ddo_to_export:[{path:[{section_tipo:['test3'], component_tipo:'test91'}]}]`
received

```
HTTP 200  ok:true
rows: [ { "t":"row", "rec":"931501", "sub":0, "c": { "0": "Sí" } } ]
cols: [ { "key":"test3_test91", … } ]
```

— the restricted component's real value. The same bypass with no array at all:
omit `section_tipo` on a deep segment.

## Shape after (TS)

The gate normalizes each declared segment the way its consumers read it (a
ONE-ELEMENT array ⇒ that element, the same reading `ddoIsAuthorized` and the
record guard already apply) and then either authorizes the resolved
`(section_tipo, component_tipo)` pair or REFUSES:

```
HTTP 403
{ "ok": false, "error": { "code": "perm.denied", … } }
```

for a non-admin caller when a segment (a) resolves to a pair the caller holds
level 0 on — unchanged — or (b) resolves to **no pair at all**: `section_tipo`
or `component_tipo` absent, null, empty, non-string, an array whose single
element is not a non-empty string, or **an array of more than one element**.
"I cannot tell what this segment names" is never an emission.

The multi-element arm was added on 2026-08-28 (second pass, class review).
`['a','b']` names no ONE pair and the consumers disagree about which half wins —
the `buildEntries` record guard and `ddoIsAuthorized` take `[0]`, and nothing
stops a later reader taking `.at(-1)`; authorizing `a` while the walk resolves
`b` is this finding all over again. The ambiguity is therefore refused rather
than resolved. The normalizer itself is no longer local to the export: it is
`resolveDeclaredTipo` in `src/core/security/frontier_scope.ts`, the ONE reading
of a declared (section, component) field for every frontier site — the ad-hoc
twin the class review named is deleted.

### 2026-08-28 addendum A — the dedalo_raw dataframe columns

In `data_format: 'dedalo_raw'` the grid mints and FILLS one raw cell per
`getDataframeChildTipos(<top component>)` frame
(`WC-2026-08-09-export-raw-dataframe-own-column`). Those are real components with
their own stored data, they appear in NO ddo path, and they therefore never
reached Gate B: a caller who may not read the frame received a column of it
because the MAIN component happened to be exportable. They are now authorized
once per run, on the same predicate as a declared segment, and an unauthorized
frame refuses the export with `perm.denied`.

### 2026-08-28 addendum B — THE EXPORT FRONTIER (SEC-01's larger half)

Gate B authorizes what the caller DECLARED. Nothing authorized what the WALK
reached. `resolveRecordAtoms` (`src/diffusion/resolve/resolver.ts`) follows the
stored `relation` locators out of each selected record into other sections'
records and serializes their values, and `createExportRun()` never received a
principal — while a stored locator may name a different section than the segment
declares, so the declared-segment gate cannot stand in for it. A non-admin export
emitted the field values of records they cannot read.

Every crossing of that walk — a relation HOP, and a relation LEAF's stored
targets, which the projection resolves into labels — now asks both frontier keys
on the RUNTIME identity: `frontierComponentAllowed` on the component the next
step will read through the locator, and `frontierRecordAllowed` (the shared
`record_scope.ts principalCanAccessRecord`, one probe per crossed record per run)
on the target record.

**The EXPORT refusal law: it THROWS `perm.denied`.** An export is a deliverable;
a silently short cell is a corrupted one, and a heritage archive must never hold
a column that is complete for one operator and quietly truncated for another.
That is a deliberate difference from the SEARCH surface, which answers so that
hit and miss are identical, and from DIFFUSION, which drops the row and ledgers
it — the three laws are written down together in
`src/core/security/frontier_scope.ts`. The refusal is loud on both channels
before the throw.

The wire effect: a non-admin export whose selection links out of their own scope
now answers `403 perm.denied` where it used to answer `200` with the other
tenant's values. Global admins and internal (principal-less) resolutions of the
same walk are byte-unchanged.

### 2026-08-28 addendum C — the DIFFUSION frontier (DIFF-C)

**FILED HERE UNDER PROTEST OF ITS ID: this is a distinct divergence on a
distinct door and wants its own `WC-2026-08-28-diffusion-frontier-scope` entry.
It is recorded here rather than nowhere because the batch that made the change
was scoped to these two files; the lead should split it out verbatim.**

`resolvePublication`'s PRIMARY selection has been principal-scoped since DIFF-01
(`selectRecordBatches` passes the enqueuing principal to `buildSearchSql`), but
the breadth-first FRONTIER drain queued related records straight into
`readMatrixRecords` with no principal at all — and everything the drain returns
is written to the PUBLIC target. A non-admin diffusing their own section
published the records of every project their records happened to link to.

The drain now asks both frontier keys per queued record — the SECTION read grant
(`frontierComponentAllowed`, resolved once per batch) and the record scope
(`frontierRecordAllowed`) — and applies the DIFFUSION refusal law: the row is
DROPPED and a ledger line written, never a throw (a publication run must not die
on one unreachable link) and never a silent skip. A dropped record is NOT marked
`unpublish`: that would let a caller who cannot READ a record REMOVE it from the
public target — a write through a door that only ever had a read question.

Unchanged for a global-admin or principal-less run (every scheduled/system
publication), which is the shape every install runs today.

### The one asymmetry, stated

Gate B keeps the BARE `getPermissions >= 1` on a DECLARED segment, while the
frontier crossings use `frontierComponentAllowed`, which additionally waves
through the sections the engine declares globally visible (thesaurus / ontology
/ langs / tools / notes and the projects section). The two answer different
questions: "may this caller ASK for this column" versus "may this walk cross into
that record". The frontier's exemptions exist for hops the ENGINE mints — a
`component_filter`'s sort path into the projects section, which no profile grants
and which the caller never typed — not for a column a user declared. Reconciling
them would WIDEN the export, which this batch did not measure; it is recorded as
a decision for the lead rather than taken here.

The same fail-closed rule was applied to the engine's shared per-component
predicate `ddoIsAuthorized` (`src/core/security/permissions.ts`), which returned
`true` for an unresolvable section. An UNDEFINED principal still applies no
filter — that is the internal-resolution posture, and it is untouched.

## Reason

Gate B is, in the code's own words, the only thing between an authenticated
non-admin and the `dd128` → `dd133` password hashes and the `dd996` API keys;
neither is projects-gated, so the record selection does not narrow them. The
material it releases converts directly into write access to the whole catalogue.
The oracle's shape is not a contract worth keeping here.

No lawful request changes shape. Census of every producer of an export path
segment in the tree (TOTAL, 2026-08-28): the client mints them in
`common.js calculate_component_path` as
`{section_tipo, component_tipo, ar_target_section_tipo, model, name}` with both
tipos plain non-empty strings read off the structure context — deep segments
included, since they come from `get_section_elements_context` of the hop's
target section; export presets round-trip those same objects; the 326 segments
in the two frozen `tool_export` parity fixtures and every in-repo export gate are
plain non-empty strings. Nothing in the tree emits an absent, empty, null or
array-shaped `section_tipo`.

## Gate reconciliation

- **New:** `test/unit/export_gate_b_native.test.ts` — the behavioural gate, on the
  synthetic ACL fixture's reader (a real non-admin, `test3` = 1, `test3.test92` = 1,
  `test3.test91` = 0) against a record it mints in its own scratch band. It asserts
  refusal for the array-shaped, absent-on-deep, absent-on-first, null/non-string and
  plain-string denied shapes; EMISSION for the plain-string and array-shaped
  authorized ones; and the fail-closed/`undefined`-principal halves of
  `ddoIsAuthorized`. Mutation-verified (see the file header) against the three
  neuterings that leave the old presence-only assertion byte-identical.
- **Unchanged:** `test/unit/human_write_scope_tripwire.test.ts`'s TOOLS-02 assertion
  still passes — it is a source-substring presence check, which is exactly why it
  could not see the `typeof` guard (GATE-24). It is now redundant beside the
  behavioural gate.
- **NO re-harvest.** The two frozen `tool_export` parity fixtures carry only
  plain-string segments (326 of them, all resolvable), so their replay is
  byte-identical either side of this change.
- **Extended 2026-08-28 (second pass):** `export_gate_b_native` gains the
  MULTI-ELEMENT array cases on BOTH fields — refused even when the component is
  the granted one and the array's first element is a readable section, so only
  the arity can explain the refusal, and the message is asserted to name the
  ambiguous shape rather than a missing grant. Mutation-verified: relaxing the
  arity check to `length < 1` reds exactly those two cases.
- **New (class gate):** `test/unit/frontier_class_native.test.ts` covers the
  EXPORT frontier behaviourally — the same hidden record written with two
  sentinels in turn must give the scoped caller ONE answer
  (`REFUSED:perm.denied`) carrying neither sentinel, while the global admin's two
  answers are REQUIRED to differ and to carry their own sentinel. Neutering
  `assertExportCrossing` reds exactly that case.
