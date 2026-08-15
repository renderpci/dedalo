# WC-2026-08-14-tm-scope-server-owned — Time Machine scope and columns are server-owned

- **Status (2026-08-15):** FULLY ADOPTED. Every Time Machine surface — the tool
  (section and component callers) and the inspector's record- and
  component-history blocks — is now an ordinary dd15 `section` instance that
  sends NO ddo_map. `client/dedalo/core/services/service_time_machine/` is
  DELETED (~1,500 lines), along with its client test and its CSS import.
- **Date:** 2026-08-14. Adopted with the Time Machine unification (S4).
- **Decision:** DEC-15; AUTHZ-02 (locator scoping); SEC-024 §9.4 (per-record scope).

## Shape before (PHP / TS-before)

The CLIENT decided what a Time Machine list was.
`client/dedalo/core/services/service_time_machine/js/service_time_machine.js`
`build_request_config()` hand-built the column ddo_map as literal objects
(`dd1371`, `dd559`, `dd578`, `dd577`, plus `rsc329` and, under `SHOW_DEBUG`,
`dd1574`), stamped every ddo `mode:'tm'`, `permissions:1`, and chose one of
three `filter_by_locators` strategies by caller model. The server then MIRRORED
that client-supplied ddo_map back as the dd15 structure-context
(`buildTmContext`) — the only read source in the engine that owned its own
structure-context, and the one place the `SectionReadSource` abstraction leaked.

Because the client also pinned `source.section_tipo` to `'dd15'`, the ACL gate
at `read_facade.ts:160` — `canAccessTimeMachineList(principal, source.section_tipo)`
— was evaluating **dd15 against itself**, never the caller section whose history
was actually being read. The per-caller-section grant that `SECTION_SPEC.md §7.4`
defines was, in practice, not evaluated.

## Shape after (TS)

The scope is DERIVED from the SQO the read already carries — deliberately NOT a
new client field:

    { kind: 'browse' | 'record' | 'component' | 'snapshot', sectionTipo, tipo? }

`resolveTimeMachineScope(sqo)` reads the same three surfaces `buildTmWhere` reads
(`filter_by_locators` with/without a `tipo`, a `tipo` COLUMN filter, or nothing),
so the columns and the WHERE always describe the same rows. A new client field
could disagree with the filter beside it; a derivation cannot.

`src/core/section/list_definitions/time_machine_list.ts` grows from an ACL
predicate into the scope + column authority:

- the scope is validated through `filterLocatorsInScope` (AUTHZ-02 shape) and
  compiled into the SQO filter via `TM_FILTER_COLUMNS`, replacing the client's
  three hand-built `filter_by_locators` strategies. An out-of-scope `tm_scope`
  is **refused loudly**, never silently emptied;
- `tmListColumns(scope)` derives the column set and the per-ddo `view`
  (`'text' | 'mini' | 'note'`) as server-emitted data: COMPONENT → meta +
  `rsc329` + the component (`view:'text'`); RECORD → meta + `rsc329`; SNAPSHOT →
  meta + the caller section's OWN ontology list columns; BROWSE → `null`, i.e.
  no server opinion, so dd15 falls back to its own ontology `section_list` like
  any other section. The old client-injected `SHOW_DEBUG` `dd1574` column
  (WC-037) died with the service and was NOT given a server twin — the source
  schema is passthrough, so any request field would be client-injectable, and
  the browse's own ontology `Valor` column already shows the raw snapshot.
  Gate: `tm_list_definitions_native`;
- `buildTmContext` is DELETED, and with it the `buildContext?` member of
  `SectionReadSource` — no read source owns structure-context any more. The
  unification, stated as a type.

**NAMED SURFACES.** Two surfaces cannot be told apart by the SQO alone — the
inspector's history panels use the same filters as the tool's, but are a few
columns wide and drop Process (dd1371), and the component panel also drops What
(dd577) because every row in it is the same component. So `source.tm_surface`
lets a caller name WHICH BLOCK it is (`inspector_record` /
`inspector_component`), never which columns it wants: the server maps the name
onto columns, an unrecognised value falls back to the SQO-derived scope rather
than erroring, and a named surface can only NARROW within the scope the SQO
already proves. It cannot reach another section's history and cannot add a
column — the two properties whose absence made the old client-built ddo_map not
a boundary at all. Declared in `concepts/rqo.ts`, not left to `.passthrough()`.

`read_facade.ts` KEEPS its `sqo.mode === 'tm'` trigger for the ACL gate: keying
the gate off a descriptor lookup on the target section fails OPEN whenever the
target is the caller section rather than dd15.

**Session SQO**: the four surfaces now share one section-instance identity and
`read.ts` merges/persists per `callerTipo`, so each scope declares
`source.session_save:false` (or a scope-qualified session key). Without it a
per-component history's `filter_by_locators` would leak into the bare dd15
browse.

## Security tightening — stated, not incidental

Making the server own the scope makes the §7.4 per-caller-section ACL evaluate
**for the first time**. Users who can see a section's history today through the
client-pinned `'dd15'` gate may lose it if they do not hold the
`time_machine_list` grant on that section.

This is adopted as a **correctness fix**, deliberately and with the owner's
sign-off (2026-08-14), and is ledgered here so it is not reverted by reflex when
someone reports "I used to be able to see this". The gate now does what §7.4
says it does.

## Reason

The client is an untrusted input surface. A list whose columns, filter and
permissions are all chosen client-side is not a permission boundary at all — it
is a suggestion the server mirrored back. Server-owned scope also removes the
last reason for the client fork to exist: with columns and filter derived from
an authorised scope, a Time Machine surface is an ordinary section list
parameterised by an SQO.

## Gate reconciliation

New TS-native gates: `tm_list_definitions_native` (pins each scope's ddo_map
against what `service_time_machine.build_request_config` hand-built, including
`dd1574` — the server must reproduce it exactly BEFORE any client deletion),
`tm_scope_authz_native` (a `tm_scope` naming a section the principal has no
grant on is refused; a non-admin `kind:'browse'` is refused),
`tm_session_sqo_isolation_native` (a component-scope filter does not survive
into a browse read). `list_definitions.test.ts` extended. The SQL backend is
untouched, so `tm_filter`, `tm_sort_policy`, `tm_count_cache`,
`tm_deep_offset_flip`, `tm_range_filter_barrier` and `tm_wallclock` stay green.
