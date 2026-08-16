# WC-2026-08-14-relation-insert-target-validation — the relation insert refuses an off-target, unreadable, non-selectable or over-cap locator

- **Date:** 2026-08-14 (the relation `view: "tree"` → thesaurus picker landing; shipped with
  `src/core/relations/save.ts` `refuseByPickerConstraint` +
  `src/core/relations/picker_constraint.ts`).
- **Decision:** — (DEC-12: the rule this closes lived only in a renderer. Canon:
  `engineering/AREA_SPEC.md` §5.7 for the shared resolver, `engineering/RELATIONS_SPEC.md`
  for the save path.)

## The seam

`validateRelationInsert` is the one door every relation locator passes through on its way
into a record — the portal's link, a picker's confirmed selection, the dataframe's frame,
an import row, a maintenance script. It normalized shape (`type`, `type_rel`,
`from_component_tipo`, lang, `paginated_key`, section_id canonicalization, dedup,
autoreference) and asked NOTHING about the target section, the principal's grant on it, the
term's own selectability, or how many locators the component is allowed to hold.

`data_limit` had **zero** occurrences anywhere in `src/`: it was enforced only in
`component_portal.js`. A cap that lives in the renderer is not a cap — it is a suggestion
to whoever uses the supported client.

## Shape before (PHP)

The insert accepted any well-formed locator. Concretely, all four of these were persisted
without complaint:

- a locator whose `section_tipo` is not among the component's declared targets;
- a locator into a section the principal cannot read;
- a term whose thesaurus declares it NOT selectable (`is_indexable` unset on its record) —
  the flag existed and governed the tree's affordances only;
- the N+1st locator on a component declaring `data_limit: N` (the browser alerted; the API
  did not).

The response reported a pagination `total` and no per-locator verdict, because there was no
verdict to report.

## Shape after (TS)

Four refusals, resolved SERVER-SIDE from the caller ddo through the shared
`relations/picker_constraint.ts` — the same module the picker read calls for its
affordances — and run AFTER the dedup, on the resulting row set, inside the caller's
transaction (the row is already locked `FOR UPDATE`). Each refusal carries a machine code
and a human reason:

| code | refused when |
|---|---|
| `off_target` | `isTargetAllowed(constraint.targets, locator.section_tipo)` is false. BOTH sides are resolved through `getSectionRealTipo`, so a virtual target matches its real section and vice versa. |
| `target_not_readable` | `getSectionPermissions(actor, target) < 1`. |
| `term_not_selectable` | `isTermSelectable(section_tipo, section_id)` is false — the term's OWN answer, the same `isIndexable` rule the tree renders. |
| `selection_limit` | the resulting row count would exceed the caller's re-resolved `properties.data_limit`. |

Three DECLARED EXEMPTIONS, each a `reason` on its branch rather than a silent skip:

- **No declared target** — a caller whose resolved sqo names no section has no target
  constraint. That is "no constraint exists", not "nothing is allowed".
- **No actor** — an UNDEFINED principal (import, CLI, background job, unit harness) applies
  no read filter, the same posture the permission layer already documents for ddo
  authorization.
- **No selectability contract** — the gate applies only where the caller declares
  `properties.view: 'tree'` (it is a picker) AND the target's `section_map.thesaurus`
  names an `is_indexable` component (it has an answer to give). A component whose targets
  are not thesaurus sections has no such contract, and `set_data` re-persists a whole stored
  array through this door — gating it unconditionally would silently drop terms stored
  before their section gained the flag, which is data loss wearing a security argument.

The cap arithmetic is stated because it decides behaviour: refusal is
`resulting > selection_limit && resulting > held`, so a component ALREADY over a limit
tightened after the fact can still be rewritten (an update lands on the same count) but
never grown.

**Known hole, named rather than hidden:** a `view: 'tree'` declared in a `ddo_map` entry
rather than on the node is not visible to this door, which has no caller-ddo context. The 7
node-level declarations are gated; the 8 ddo_map ones are not, and closing that needs the
caller ddo threaded through the save request.

## Reason

A rule enforced only in the renderer is an invariant with no gate — the exact shape DEC-12
forbids — and here it is a data-integrity surface, not a cosmetic one. The picker makes it
load-bearing rather than theoretical: a multi-select tray hands the save N locators at once,
so `data_limit` and dedup become properties of the SET (see
`WC-2026-08-14-relation-insert-accepts-batch`), and N individually-legal picks can
collectively break a cap that is only ever checked one request at a time.

The asymmetry with the read path is the whole design: the read resolves the constraint for
the AFFORDANCES the tree offers, the write re-resolves it for PERSISTENCE. One resolver,
two call sites — so a rendered affordance is never mistaken for an authorization, and a
forged or stale client cap changes nothing.

## What a consumer must expect

1. A locator the retired engine stored can now be refused. The refusals are NAMED, per
   locator, with a stable `code`; a client should render a catalog label keyed on the code,
   never the English `reason` (which is a server diagnostic).
2. Off-target and non-selectable locators arriving through the LEGACY single-locator door
   are dropped and logged rather than thrown — that is that door's pre-existing
   "null = ignored" contract. Callers wanting the reason must use the batch door.
3. Nothing about the dataframe frame shape changes: `normalizeDataframeEntry` still forces
   `type`, `from_component_tipo`, `main_component_tipo` and `id_key` from the server-side
   pairing.

## Gate reconciliation

- `test/unit/relation_insert_target_native.test.ts` — the seven codes against the save API
  directly (never through the client), on a scratch twin: in-target accepted, off-target
  refused, a VIRTUAL target accepted, a target the principal cannot read refused, a
  non-selectable term refused THOUGH THE CLIENT SENT IT, and `data_limit` exceeded refused;
  plus each declared exemption exercised so an exemption cannot silently become the rule.
- `test/unit/dataframe_write_contract_native.test.ts`,
  `test/unit/dataframe_idkey_native.test.ts`, `test/unit/ws_a_tripwires.test.ts` — the
  pre-existing write contract, unchanged by the added gates.
- `test/unit/thesaurus_picker_tripwire.test.ts` — the client stamps no relation `type`, so
  the dedup key this door refuses against is the server's.

**Re-harvest: NOT APPLICABLE.** A refusal on a request the retired engine ACCEPTED has no
fixture twin — the frozen store contains no such interaction (measured: no fixture request
carries a picker declaration, and the store holds no write of an off-target locator).
Nothing in the store's replayed bytes changes; there is nothing to re-harvest and, per
`engineering/ORACLE_HARVEST.md`, no way to.

## Addendum 2026-08-16 — gate 2 scoped and fail-closed; the length-1 door THROWS

Three corrections from the adversarial review of the landing, all in
`src/core/relations/save.ts`:

1. **`target_not_readable` is SCOPED to tree-picker callers** (the same scope as the
   selectability gate: the caller declares `properties.view: 'tree'`). As landed, gate 2
   judged the target section for EVERY caller and refused every non-admin's own
   component_filter → `dd153` pick — profiles grant the FILTER component (level 2), never
   the projects SECTION (level 0), and the datalist was built from the user's own
   authorized projects (measured: all 20 non-admin users of the test DB). The read model
   for a portal/autocomplete/filter/select is the opposite of that gate: a value reached
   THROUGH an authorized caller is floored to read (`permissions.inheritSubdatumPermission`),
   so authorization there IS the caller grant, which dispatch enforces (`>= 2` on the
   component) before the door is reached. For a tree picker the gate stays: it is the write
   twin of the picker READ, which prunes hierarchies the principal holds no grant on.
2. **The "no actor" posture inside that scope is FAIL-CLOSED**, not an exemption: a
   net-new pick into a tree-picker caller with no principal — neither threaded
   (`SaveRequest.principal`, passed by dispatch and the MCP write tools) nor ambient
   (the request-context ALS, now the documented BACKSTOP only) — is refused
   `target_not_readable`. The table's "No actor" exemption row above is therefore
   RETIRED for gate 2. Credless doors (import, maintenance) re-persist stored arrays
   through the `storedItems` baseline (gate 0) and are unaffected.
3. **Constraint refusals through the length-1 door are THROWN, not dropped.** "What a
   consumer must expect" item 2 above is superseded: `validateRelationInsert` now throws
   `relation.insert_refused` (400, `details: {constraint, section_tipo}`) for
   `off_target` / `term_not_selectable` / `selection_limit`, and the generic `perm.denied`
   (403, naming nothing) for `target_not_readable`. The save transaction rolls back and the
   API answers the named refusal; a 200-with-nothing-stored was a silent scope narrowing.
   The PHP-era drops (`bad_form` / `autoreference` / `duplicate`) keep the null/ignored
   contract — the client's server-authoritative duplicate check depends on it.

Also in the same pass: the selection cap counts `held` in the CAP SCOPE (per main item for
a dataframe pairing — `picker_constraint.inCapScope`, one predicate for both sides), and
the re-persist baseline compares through the locator law (`compareLocators`: section_id
loose-numeric, tipo strict; frame pairing String()-loose) instead of key-string equality.

Gates: `test/unit/relation_insert_target_native.test.ts` — the READ GRANT describe (tree
picker refused / non-picker accepted / fail-closed no-actor / threaded principal wins /
the component_filter non-admin persists a project through the REAL save door), the
RE-PERSIST baseline describe, the DATAFRAME cap describe, and the save-path describe
asserting the wire status + code. `test/unit/external_write_refusal_tripwire.test.ts`'s
"curated write" fixture now names a caller that DECLARES its target (`test80` → test3);
the previous fixture (`numisdata434`, absent from the suite DB) was green only because the
door silently dropped it.
