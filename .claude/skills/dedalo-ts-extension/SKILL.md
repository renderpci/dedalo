---
name: dedalo-ts-extension
description: How to EXTEND the Dédalo v7 TypeScript/Bun engine the descriptor-shaped way — add a component model, a tool, or an area without scattering edits. Use when adding or editing a component model (src/core/components/component_<model>/descriptor.ts + registry.ts), when descriptor_completeness_tripwire.test.ts or import_scc_tripwire.test.ts FAILS, when asking "why do I have to edit N files to add a model", when wiring emitHook / searchBuilder / resolveData / flatValue / importValueProperty facets, when adding a new cross-subsystem lookup and hitting a static-import cycle (SCC of size >1), or when adding a tool (src/core/tools/) or an area. Names: ComponentModel, getComponentModel, registerComponentModelFieldsLookup, RESOLVER_IMPLEMENTATIONS, EMIT_HOOKS, usesImportValueProperty. Checklist lives in src/core/components/README.md; state in rewrite/LEDGER.md.
---

# Dédalo v7 — extending the engine (TypeScript rewrite)

The engine is **ontology-driven**: the component `model` (`component_input_text`,
`component_portal`, …) is the atom. Resolution is horizontal — it lives in the
engines (`resolve/`, `search/`, `relations/`, `section/`) that dispatch on the
`model` string. To keep that dispatch from being a scatter of private lookup
tables, every model has a **named home**: `src/core/components/component_<model>/`
holding a `descriptor.ts` (and usually a `samples/` reference set). This skill is
orientation for extending the engine; the mechanical steps are the checklist that
already lives in the code — do not duplicate it, follow it.

## The load-bearing rule

**Adding a component model is a DESCRIPTOR + REGISTRY change, declared — not a
scatter of engine edits. But that is a GOAL the code only partly reaches, and
lying about the gap is the failure mode.** Descriptors route: column/alias
resolution, translation gating, relation read + relation-search dispatch,
default relation type, the non-relation SQO builder family, the CSV-import value
set, the flat display-value family, and emit-time particularities. A handful of
facets historically lived in scattered `switch` statements; the 2026-07 audit
(**S2-26**) found the "nothing else in the engines changes" claim was
**overstated**, converted the routable ones into descriptor facets, and installed
a tripwire so the claim can no longer rot. A few branches are STILL scattered —
those are named honestly in the checklist (step 10-14) and tracked in the ledger.

**The authoritative checklist is `src/core/components/README.md` ("Adding a
component model — the HONEST checklist").** Read it and the interface in
`src/core/components/types.ts` before writing a descriptor. Read a real one first:
`component_input_text/descriptor.ts` (scalar) and `component_portal/descriptor.ts`
(relation) are the two canonical shapes.

## The descriptor facets (what you DECLARE)

A `ComponentModel` (`src/core/components/types.ts`) is **declarative** — small data
+ references to behavior, never inline logic (or it rots into a god-registry). The
facets, each read by an engine accessor in `registry.ts`:

- `column` / `alias` — storage + column resolution (`getColumnNameByModel`,
  `getModelByTipo`). Every descriptor MUST name one — the tripwire checks it.
- `classSupportsTranslation` — read-time lang filtering gate.
- `resolveData` (relation models) — a `RelationResolverId` **string**
  (`'portal' | 'filter' | 'select_family' | 'relation_children' | 'relation_index'
  | 'relation_related'`), resolved by `relations/registry.ts`
  `RESOLVER_IMPLEMENTATIONS`. It is DATA, not a function ref — that is what keeps
  `components/` from importing `relations/` (see the SCC rule below).
- `search` — `{status:'ported'}` or `{status:'unported', reason}`; unported makes
  `search/conform.ts` throw loudly instead of silently mis-searching.
- `defaultRelationType` — the PHP class `$default_relation_type`.
- `searchBuilder` (non-relation searchable) — a family name
  (`'string'|'number'|'date'|'iri'|'section_id'`); without it SQO searches on the
  model throw in `conform.ts`.
- `importValueProperty: true` — CSV cells import as `{value:…}` items, not raw
  strings (PHP `$components_using_value_property`; the descriptor field is read via
  `usesImportValueProperty(model)` in `registry.ts`, consumed in
  `src/core/tools/import_data.ts`).
- `flatValue` (`'string'|'datalist'`) — the flat display-value family.
- `emitHook` (an `EmitHookId`) — an emit-time particularity; implementation goes
  in `components/emit_hooks.ts` `EMIT_HOOKS`. This **replaced the old
  out-param + WeakSet emit protocol** (WS-C / **S2-24**): each per-model quirk now
  routes through its hook; `section/read.ts` `emitDdoData` keeps exactly ONE
  inline per-TIPO transform (dd546), because a per-tipo rule has no per-MODEL home.
- `fixedDataframeTipos` — models that always pair with fixed dataframe frames
  (e.g. `component_iri`'s dd560).

Then register it: add the import + array entry in `src/core/components/registry.ts`.
A malformed descriptor or dangling alias fails the **load-time coverage check** at
boot; `test/unit/component_registry.test.ts` pins registry/table equivalence.

## Why the tripwire exists (the audit's central lesson)

The audit's finding: **every invariant enforced only by prose was violated in
practice; every tripwired boundary held.** Rule: *tripwire or delete.* Two guard
extension:

- **`test/unit/descriptor_completeness_tripwire.test.ts` (S2-26/DEC-12)** — FAILS
  if a registered model omits a required facet: no storage route; a relation model
  missing its relation face; a facet on the wrong column; a non-relation model that
  made no explicit search decision (declare `searchBuilder` or appear in the
  ledgered unsearchable set); or a descriptor edit that silently changes the derived
  CSV-import / propagate engine sets (the diff shows here). **What breaks without
  it:** a new model that silently resolves as `null`, mis-searches, or imports as raw
  strings — the exact scatter this design exists to kill. Its allowlists may only
  SHRINK, cleared by the commit that ports the missing behavior.

- **`test/unit/import_scc_tripwire.test.ts` (S2-20)** — FAILS on any static
  value-import strongly-connected component of size >1 (allowlist currently EMPTY).
  The audit found a **33-file cycle** fusing six subsystems; a single review-invisible
  module-level constant computed from a cyclic binding **can throw at ESM boot for
  some import orders only**. It was dissolved by breaking its two closing edges — and
  those two inversions are the PATTERN you must follow for any new cross-subsystem
  lookup:
  1. `ontology/resolver.ts → components/registry.ts` inverted to a **boot-time
     registration**: `registerComponentModelFieldsLookup` (resolver does NOT import
     the registry statically; the registry registers a callback into it at boot).
  2. `descriptors → relations/models/*` replaced by the **DATA binding**
     (`resolveData` is a string ID, resolved in `relations/registry.ts`).

  **If you trip it:** do not allowlist first. Break the cycle — a registration seam,
  a data binding (string ID + a resolve table), or a `import type` (type-only edges
  are excluded). Allowlist only a genuinely irreducible knot, as a named+sorted
  member list with a written justification.

## Adding a new cross-subsystem lookup — follow the inversion

Need engine A to consult a table owned by engine B, and a static import would close
a cycle? **Register a callback at boot, don't add the static import.** Copy
`registerComponentModelFieldsLookup` (the `cache_invalidation.ts` registration
pattern): B exposes a `registerXLookup(fn)`; whoever owns the data calls it once at
module init; A calls the registered fn at runtime. This keeps the static import
graph acyclic and the SCC tripwire green.

## Adding a tool

The tool framework is native TS under `src/core/tools/` — dispatch + gates in
`dispatch.ts` (Gate 6 = the per-module `API_ACTIONS` allowlist), the module shape in
`module.ts`, schema in `register_schema.ts`, ontology constants in `ontology_map.ts`.
Tool code lives under `tools/tool_<name>/server/`. **Cross-link the `dedalo-tools`
skill** for the tool_paths multi-root rule, `tool_security`/`API_ACTIONS`
enforcement, `register.json` format, and cache invalidation.

## Adding an area

An "area" is an ontology model with NO matrix row; only `area_maintenance` has the
widget framework. **Cross-link the `dedalo-area-maintenance` skill** for the widget
dispatch, the per-widget `API_ACTIONS` allowlist, and the `get_ar_widget_ids` drift
guard. The core→diffusion seam (`src/core/diffusion_bridge/`) is facade-only and
guarded by `test/unit/boundary_seam_tripwire.test.ts` — grow it through the facade,
never reach across.

## PHP is the oracle — verify every extension

The live PHP server on the SAME Postgres is the byte-coexistent oracle. A new model,
tool, or facet is not done until it matches PHP differentially. Client assets in
`client/` are **byte-identical to the PHP source — never edit them; sync from PHP**
(`test/unit/client_serving.test.ts` enforces byte-identity). Use the
**`dedalo-parity-debugging`** skill for the differential-gate + Chrome-MCP workflow,
and **`dedalo-relations-ts`** when the model is relational.

## What STILL needs care (be honest — check the ledger)

Not every branch is descriptor-routed yet. **`rewrite/LEDGER.md`** (the living measured
state — read it for where we are, never duplicate it) tracks the open gaps. As of
2026-07-07 the scattered engine-side steps a new model may still need are named in
`README.md` steps 10-14: `resolve/relation_list.ts` per-model value branches (still
hardcoded, WS-B rewire pending — a new model may render `null` cells until added),
`resolve/section_elements_context.ts` `DEFAULT_EXCLUDE`, `ai/rag/config.ts`
`DEFAULT_EMBEDDABLE_MODELS`, and any dedicated unported search pipeline. Check the
ledger before assuming a model is fully routed.

## Discipline

- The descriptor DECLARES, it never grows inline behavior — point to the heavy
  module in a comment (as `component_relation_parent/descriptor.ts` points to
  `relations/parent.ts`).
- No silent narrowing: an unported facet THROWS with a ledgered reason; it does not
  quietly fall through.
- Error handling → `engineering/CONVENTIONS.md` §1; dynamic imports → §2. Config reads go
  through `readEnv` (`src/config/env.ts`) only — no `process.env` outside
  `src/config/` (`test/unit/config_env_tripwire.test.ts`). No request/principal/lang
  state in a module-level `Map`/`Set`/`let` (`test/unit/module_state_tripwire.test.ts`).
