# WC-2026-08-11-diffusion-uninstalled-package-skip — an absent ontology package skips its ddo, and its column with it

- **Date:** 2026-08-11 (merge of `gitdedalo/v7` e640dbf0ad into v7).
- **Decision:** DIFFUSION_SPEC §4.1. **Reverses the "degrade in place" half of
  [WC-2026-08-09-diffusion-degradation-and-loud-ddo-fns](WC-2026-08-09-diffusion-degradation-and-loud-ddo-fns.md)**
  (that entry's point 1 — the other points stand).

## What changed, and why it needed a decision

Both halves of this merge fixed the SAME production incident from opposite
directions: the Oral History element `mht2` references the `zenon*` DAI
catalogue nodes through four ddo_maps, that package is not installed, and the
whole publication run died with `ddo tipo 'zenon4' not found in the ontology`.

- 2026-08-09 (this branch) made a missing node **field-local**: the ddo kept its
  place in the compiled chain as a `degraded` step resolving to zero atoms, so
  the field's column topology could not shift. Nothing was ever fatal.
- 2026-08-11 (incoming) split the cause instead: a tipo whose **TLD carries no
  `dd_ontology` content** is an optional PACKAGE this deployment does not have —
  a deployment fact, skipped with a warning; a missing node inside an INSTALLED
  package is an authoring defect and stays a hard compile error.

The second rule was adopted. The first is repealed.

## Shape before (this engine, 2026-08-09 → 2026-08-11)

A ddo whose tipo had no ontology node produced a `degraded` ResolveStep in the
chain and a structured `PlanDegradation` on the plan. The field kept every
column slot of its raw `ddo_map`, and `rsc1194` published `Historia, ` — the
empty `zenon4` slot joined by the string merge.

## Shape after (this engine, from 2026-08-11)

- TLD with no content → the ddo is **dropped from the chain**, one
  `uninstalled-tld:<tld>@<field>` plan warning per field, compile succeeds.
- TLD installed, node missing → compile ERROR, element refused (as before 08-09).
- No `PlanDegradation` is produced by this path any more.

## The divergence this ACCEPTS (stated, not discovered later)

The PHP oracle derives a datum's `columns` from the FULL `ddo_map` —
`dd_diffusion_api::build_datum_context` :1288-1308, every ddo not named as
another ddo's `parent`, **with no ontology lookup at all**. The oracle therefore
publishes a column for a tipo it cannot resolve; this engine no longer does. On
an install missing an optional package, a multi-ddo field publishes one FEWER
joined slot than the oracle:

    rsc1194, install without zenon    oracle: "Historia, "    TS: "Historia"

That is a real wire divergence in published bytes, accepted deliberately in
exchange for the package/defect split. It is pinned — with the oracle's value
named in the assertion — by the `THE mht2 CASE` test in
`test/unit/diffusion_compile_degrade_native.test.ts`.

## What did NOT follow the reversal

**The `output_format` fallback still keys off `ddo_map[0]`, never
`sourceChain[0]`.** PHP reads `$first_ddo = $ddo_map[0]` (:1300) and looks its
model up; a skipped tipo has none, so there is no fallback. Reading the compiled
chain instead would slide the SECOND ddo into first place and stamp a `json`
output_format the oracle never picks. `compileFieldPlan` reuses the compiled
step's model only when that step IS `ddo_map[0]` (same tipo) — correct and
lookup-free. Gate: `a SKIPPED first ddo does not promote the second`.

The sibling position-keyed behaviour named in the 08-09 entry — the
relation-identity stamp `$is_first_ddo = $ddo_map[0]->tipo === $current_tipo`
(`diffusion_chain_processor` :243) — is resolver-side and unaffected by compile
pruning, since it compares tipos rather than chain positions.

## Consequences left open (not silently absorbed)

- `PlanDegradation`, the `degraded` ResolveStep kind and
  `planDegradationReportLines` now have **no producer**. The plumbing survives in
  `plan/types.ts`, `resolve/resolver.ts`, `export/compile_columns.ts` and
  `runner.ts` as defensive guards. Removing it is a separate, deliberate pass —
  DEC-12 says an invariant is tripwired or deleted, and this one is now neither.
- A ddo hanging under a SKIPPED one keeps a `parent` naming the vanished entry,
  so it lands in a `chainTreeOf` bucket no walk visits: unreachable, publishing
  nothing, adding no phantom column. That is asserted rather than assumed
  (`ddos hanging under a SKIPPED one are unreachable, and add no phantom column`).

## Gates

- `test/unit/diffusion_plan_uninstalled_tld.test.ts` (incoming; install-independent
  TLDs — `zzzznotinstalled` for the package case, a missing `rsc` node for the defect).
- `test/unit/diffusion_compile_degrade_native.test.ts` (rewritten to this contract,
  including the accepted divergence and the `output_format` carve-out).
