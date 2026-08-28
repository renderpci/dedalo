# WC-2026-08-28-search-path-acl-every-hop — a multi-hop search path carries the caller's record ACL at EVERY hop, not the first

- **Date:** 2026-08-28 (deep audit 2026-08-26, finding SEC-02 (S1, CONFIRMED,
  reproduced through the real API door); remediation row P1-1).
- **Decision:** DEC-15 (deliberate divergence — PHP has the same hole, so the
  fix is a divergence, not a parity repair), DEC-12 (the gate lands in the same
  change: `test/unit/search_path_acl_native.test.ts`).

## What diverges

A search filter (or ORDER) leaf whose `path` has more than one step makes the
assembler emit, per hop, a `LEFT JOIN LATERAL
jsonb_array_elements(<prev>.relation->'<hopTipo>')` plus a `LEFT JOIN
<stepTable>`, and it builds the leaf predicate against the LAST alias. Those
joined aliases now carry the caller's per-record ACL, and a path step naming a
component the caller holds level 0 on no longer answers.

## Shape before (PHP, and TS through 2026-08-27)

`conformLeaf` and `buildJoinChain` received no principal; `buildSearchSql`
emitted the projects containment and the dd478 record filter against the MAIN
alias ONLY. So the WHERE clause of a listing the caller IS allowed to run could
name a component of a record the caller is NOT allowed to see, and the row's
presence answered a question about that hidden record. Reproduced on the suite
database through the real API door, both cross-project and
cross-section-with-zero-grant:

```
read { sqo.section_tipo:['test3'],
       filter path [{test3,test54},{dd128,dd132}], q:'zzacl_adm*' }
  → 200 ok:true, entries [test3/938777]
read { … same, q:'zzacl_zzz*' }
  → 200 ok:true, entries []
read { sqo.section_tipo:['dd128'] }
  → 403 perm.denied
```

Begins-with, ends-with, contains and `==` are all reachable through the string
builder, so the HIT/MISS pair on a one-character change is a **prefix oracle**:
the hidden value comes out character by character.

## Shape after (TS)

Two changes, both inside the join chain (`src/core/search/conform.ts`
`buildJoinChain`, now the single home — `conformLeaf` used to copy-paste it,
which is how the FILTER twin and the ORDER twin could drift):

1. **The record ACL rides every hop's ON clause.** The assembler builds one
   `SqlFrontierScope` per query (`src/core/security/frontier_scope.ts` — THE one
   frontier-scope interface, shared with the export and diffusion frontiers) and
   threads it in, so the hop predicate and the main-alias predicate are the SAME
   builders (`buildProjectsFilter` for the projects
   containment, plus a hop-shaped dd478 filter that selects itself off the joined
   row's own `section_tipo`). It goes in the **ON clause, never the WHERE**: an
   unreadable target then simply does not join, the alias is NULL, and the leaf
   reads exactly as it does for a record holding no such relation — LEFT JOIN
   semantics intact, `$not`/`$nand`/`$nor` still sound, and no main row silently
   dropped.
2. **A path step beyond the main section needs the caller's per-component read
   grant** — `frontierComponentAllowed`, whose one decision is
   `ddoIsAuthorized(principal, step.section_tipo, step.component_tipo)` under the
   frontier's declared exemptions (below). An unauthorized leaf answers `1=0` —
   not a throw (a refusal is itself a signal, and it would break the one
   unauthorized leaf of an autocomplete's `$or` `filter_free` for every user) and
   not a drop (dropping a conjunct WIDENS an `$and`). An unauthorized ORDER path
   is skipped, so the sort falls back to the `section_id` default; the rows and
   the row count are unchanged.
3. **Every surviving refusal is LOUD** (added 2026-08-28, second pass). A
   narrowing nobody can observe is what AGENTS.md forbids, and both halves above
   were silent: the leaf answered `ok:true` with an empty `entries` and a shrunken
   `full_count`, and the sort silently became `section_id`. `noteFrontierRefusal`
   now writes a named operator log line (`[frontier] REFUSED search/search.path:
   …`) and records a request-scoped refusal on the ALS request context, from
   which `frontierRefusalNotice()` builds
   `{code:'perm.out_of_scope', label_key:'error_perm_out_of_scope',
   retryable:false}` for the envelope's `notices[]`. **The handler-side wiring is
   OPEN as of this entry** — the sink and the notice builder are landed and
   gated, but no `ok(...)` call site passes them yet, so the envelope does not
   carry the notice today; the log line is the live channel. Closing it is one
   line at each read door (`src/core/section/read_source.ts`,
   `src/core/section/read.ts`, `src/core/api/handlers/dd_core_api.ts`), none of
   which this change was allowed to touch. The notice carries no `details` —
   `perm.out_of_scope` declares no `details_keys`, and naming the hidden record's
   coordinates on the wire would re-open the very oracle this entry closes; the
   log line carries them. ONE notice per request however many crossings were
   refused: a count is itself an existence oracle (the same reason
   `scopeInverseReferenceHits` refuses to report "n hidden").

The wire effect: a multi-hop filter over records the caller may not read now
answers `entries: []` where it used to answer with the owning record and the
`full_count` shrinks correspondingly. The envelope is otherwise UNCHANGED today:
the `notices[]` entry is built and gated but not yet attached (see 3).

## Reason

The row's presence is an answer about a record the caller was refused at the
door. Bounded, but real: the searchBuilder families reachable through a hop are
string / number / date / iri / json / section_id — `component_password` declares
none, so a `dd133` hop throws `engine.uncovered_scope` and there is no
password-hash oracle — and the hop needs a stored cross-project locator, which is
ordinary in a heritage install (a shared image, a shared authority, a
bibliography entry). Parity with PHP does not save it; it makes the fix an entry
here.

**The over-eager direction was established before anything was refused** for the
RECORD key, and had to be re-established for the COMPONENT key. The record
exemptions are the main alias's, arm for arm: an absent principal is an internal
search and is not gated at all, a global admin bypasses the projects filter, the
server-only `skip_projects_filter` bypasses it, and `FRONTIER_VISIBLE_TABLES`
(thesaurus / ontology / langs / tools / notes) is honoured per hop — without that
last one, every hop into a thesaurus would have died and ordinary searching would
have broken for every non-admin.

**THE COMPONENT KEY OVER-REFUSED ON ITS FIRST LANDING, and the correction is
part of this entry (2026-08-28, second pass).** The first shape asked
`ddoIsAuthorized` bare, and that silently killed the server-built ORDER path of
EVERY `component_filter` column and of every `component_select_lang`. Those
paths are ENGINE-MINTED, not client-declared: `search/order_path.ts` builds
`[self, dd156@dd153]` for a component_filter (PHP
`component_filter::get_order_path`) and `[self, hierarchy25@lg1]` for a
select_lang (PHP `component_select_lang::get_order_path`), unconditionally. No
profile grants `dd153_dd156` or `lg1_hierarchy25` — those sections are engine
infrastructure, not curator-configured (measured on the suite database: the one
real profile carrying grants enumerates 436 component rows over 10 sections and
names NEITHER dd153 NOR lg1). MEASURED with a real non-admin principal on the
suite database, first shape: `ORDER BY section_id ASC`, zero join aliases, while
the superuser got `ORDER BY dd156_order ASC NULLS LAST` — a sort the user asked
for, silently not performed.

The correction: the component key now skips exactly the sections the RECORD key
already declares ungated, and nothing else — `FRONTIER_VISIBLE_TABLES` by table
plus `config.features.filterSectionTipo` (dd153) by tipo, which is the arm
`buildProjectsFilter` returns `''` for *because projects are globally visible*.
A component gate that refuses the very targets the record gate exempts is not
caution, it is a contradiction. Two sections `buildProjectsFilter` also names are
DELIBERATELY not exempt: dd234 (its record exemption exists so a user can read
the profile that grants them rights — not a licence to filter dd774, the grant
matrix itself) and dd128 (`buildUsersProjectsFilter` is a restriction, never an
exemption). Both are gated behaviourally in `search_path_acl_native`.

The component gate is otherwise the SAME predicate that decides whether a client
could legitimately BUILD this path at all. A multi-hop filter path is minted from
`search.ddo_map` / `show.ddo_map` (`common.js build_rqo_search` →
`get_ar_inverted_paths`, one path per leaf ddo), and `section/read.ts`
`buildStructureContextEntries` DROPS any ddo — nested ones included, where the
declared `section_tipo` IS the hop target — that fails
`ddoIsAuthorized(principal, ddoSectionTipo, ddo.tipo)`;
`relations/request_config/implicit.ts` `filterAuthorizedRelated` applies the
same rule when it derives a portal's map. So what the gate refuses is exactly
what the caller could not have seen in the results anyway. (The
`inheritSubdatumPermission` floor cited below is a DIFFERENT surface —
already-resolved subdatum ITEMS, which mint no search path.) Measured on the
suite database: the one real profile carrying grants enumerates components in
EVERY section it grants (436 rows over 10 sections; zero section-only) — but it
names NO infrastructure section at all, which is precisely why the bare
predicate over-refused and why the exemption above exists.

`filterAuthorizedRelated` answers the same COMPONENT question with NO exemption,
so a non-admin's `component_filter` widget carries no project name today. That is
STRICTER than the frontier, therefore fail-closed and not a hole — it is recorded
as an open door in `test/unit/frontier_class_native.test.ts`'s shrink-only
census, to be reconciled against this predicate rather than silently widened
from the search path.

**Deliberate deviation from the remediation's letter:** it asked for a refusal
of "a hop into a section the principal holds 0 on". The engine does not
authorize a hop by the destination SECTION anywhere else. Every gate that stands
between a caller and a related record's value is keyed on
`(targetSection, COMPONENT)` — `filterAuthorizedRelated`, the structure-context
drop, the emission backstop — and `inheritSubdatumPermission` goes further in
the opposite direction: a resolved subdatum item is FLOORED to read "through the
authorized generating component (portal targets stay visible without a
target-section grant)". A section-level refusal would therefore be stricter than
any read path in the engine and would break "search coins by their mint's name"
for every profile that grants the mint components without granting the thesaurus
section — the outage shape this programme has already produced once. The
component grant is the engine's own rule and is what landed; the section-level
question is recorded as OPEN, to be decided against the read path rather than
against the search path alone.

## Gate reconciliation

- **New:** `test/unit/frontier_class_native.test.ts` — the CLASS gate. One
  behavioural probe run against all three frontier surfaces (search, export,
  diffusion): the hidden record is written with two different sentinels in turn
  and each surface's serialized answer must be BYTE-IDENTICAL across them and
  carry neither sentinel, while the same pair of probes run as a GLOBAL ADMIN is
  REQUIRED to differ (so the probe is proved non-degenerate rather than
  comparing two empty answers). It also asserts the two exempt-table sets are one
  declaration plus one stated addendum, and carries the shrink-only census of the
  frontier doors this batch did not close. Mutation-verified: neutering the hop
  ON-clause predicate, the export crossing assert, or the diffusion frontier drop
  each reds exactly its own surface.
- **New:** `test/unit/search_path_acl_native.test.ts` — builds its own
  user/profile/projects/records situation in the reserved band 931000-931099 on
  the generic `test` TLD (it does not reuse `acl_identity_fixture`, whose reader
  profile grants only a `component_publication` on `test3`, which would make every
  assertion here vacuous). It PARSES the emitted SQL, censuses the join aliases
  TOTAL at one hop, two hops, an ORDER path, a dd478 allow-list and the audit's
  literal `dd128` repro shape — an alias without a predicate is RED — and runs the
  behavioural probe: HIT and MISS are byte-identical for the scoped principal
  while the admin's same two probes differ. It also pins the non-over-eager half
  (own-project hop still matches; internal search emits the bare join; admin hop
  carries no containment) AND the over-refusal repair: the engine-minted
  component_filter and select_lang ORDER paths still emit their join and still
  sort by the real key for a caller who holds NO grant on the target component
  (asserted zero first, so the exemption and not a grant is what saves them),
  while a hop into dd234/dd128 still answers `1=0`. The loud half is gated too:
  inside a request scope a refused search records a `perm.out_of_scope` refusal,
  and outside one it records nothing (the sink is request-scoped by
  construction). Mutation-verified against five separate neuterings.
- **Unchanged:** `test/unit/search_count_shape.test.ts`'s multi-hop cases build
  with no principal, so their SQL is byte-identical.
  `test/unit/search_projects_filter_multisection.test.ts` covers the main alias
  only and is untouched.
- **NO re-harvest.** The frozen fixture store holds no principal-scoped multi-hop
  search, and the credless replay resolves no principal at all — the internal
  posture, which this change leaves byte-identical.
