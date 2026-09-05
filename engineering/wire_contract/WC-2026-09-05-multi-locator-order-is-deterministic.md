# WC-2026-09-05-multi-locator-order-is-deterministic — a record sorts by its FIRST stored locator

- **Date:** 2026-09-05, adopted with the change that closes audit row P2-30-search
  (findings PERF-08, PERF-09, PERF-10).
- **Decision:** DEC-12 (the invariants land with their gates:
  `test/unit/search_order_multilocator_native.test.ts`,
  `test/unit/list_count_budget_native.test.ts`).

## Shape before (PHP)

PHP's `build_sql_join` unnested a relation component with
`LEFT JOIN LATERAL jsonb_array_elements(prev.relation->'<tipo>')`, and
`trait.order` case (d) reused that same chain to reach a related section's sort
key. A relation component holds an ARRAY, so one record with two locators became
TWO joined rows, and the outer `DISTINCT ON (section_id)` kept whichever the
planner produced first.

The paginator total was a live `count(*)` on every paint except one narrow case:
an UNFILTERED browse of a `policyForTable`-governed log table.

## Shape after (TS)

1. **`buildJoinChain` takes an explicit `purpose`** (`src/core/search/conform.ts`).
   `'filter'` KEEPS the fan-out — a filter must match ANY locator. `'order'`
   COLLAPSES it to exactly one row:
   `jsonb_array_elements(…) WITH ORDINALITY AS locator(value, ord) ORDER BY
   locator.ord LIMIT 1`, inside the LATERAL.

   **THE RULE: a multi-locator component sorts by its FIRST STORED locator** —
   the record's own stored order, the same order the client renders the portal
   in. It is stated in `buildJoinChain`'s docstring, next to the filter twin, so
   the two cannot drift; that one home is the file's own reason for existing.

   The two purposes emit different joins, so they carry different alias
   namespaces (`o_` / `j_`) and can never dedup into each other in the
   assembler's alias-keyed join sink.

   Considered and REJECTED: refusing to sort on a multi-locator component and
   falling back to the `section_id` default (the SEC-02 refusal path). That
   makes the sort silently absent on ordinary heritage data; the collapse is
   deterministic AND total.

2. **The browse count is cached for EVERY section, admin or not**
   (`src/core/search/bare_count.ts` `scopedBrowseCount`, PERF-10). ONE arm, not
   two: no joins, one section, and `whereParts` holding NOTHING that is not the
   caller's own ACL. That covers the bare browse AND the non-admin's, whose
   projects / `filter_records` predicate lands in `whereParts` and could
   therefore never reach the old `whereParts.length === 0` short-circuit. The
   `policyForTable` gate is dropped: an ordinary section is counted on the same
   paint and is exactly as cacheable.

   **The cached query is the assembler's OWN**, handed over verbatim — never
   re-derived as `count(*) WHERE section_tipo`, because `mainWhere` may carry
   more than the tipo pin (the users section's root-record exclusion is exactly
   such a conjunct, and a re-derived count would have silently counted root).
   The key is the RENDERED WHERE **plus its bound values**: the rendered text
   carries `$1` placeholders, so two principals with different grants render the
   same text and differ only in what is bound — a text-only key would serve one
   curator's total to another. "ACL-only" is counted at the push site, never
   sniffed out of the rendered SQL.

3. **The assembler's two verdict caches carry a TTL FLOOR** beside their
   save-event eviction (PERF-09): `projectsDensityCache` and `sectionTotalCache`
   now store `{value, at}` and are read through `freshValue`, on
   `TM_COUNT_CACHE_TTL_MS` — the same backstop the browse counts use. TTL 0
   means EXACT. `uniqueSectionKeyCache` is exempt with its reason: it caches a
   schema property no data event can change.

## Reason

Measured on the zzscale corpus's two-locator record: the ORDER chain produced 2
rows for 1 record, so the sort key was an arbitrary locator's value and the
whole related section had to materialise before the LIMIT could apply. A sort
that is not a function of the data is not a sort.

The count half is the ordinary curator's paint, not an edge case: a non-admin's
ACL predicate lands in `whereParts`, so the old short-circuit could NEVER fire
for them and every list paint re-counted the section from scratch. The
save-event eviction is exact for writes this process sees and blind to every
other one (a sibling worker, an importer, psql), which is what the TTL floor
answers.

## Consumer impact

- A list sorted by a related section's component now returns a STABLE order
  across identical paints. Where a record holds several locators the sort value
  may differ from what an arbitrary previous paint happened to pick; there was no
  defined previous answer to preserve.
- Row counts, row identity and the LIMIT window are unchanged: the collapse is
  inside a LATERAL feeding a LEFT JOIN, so a record with no locator still emits
  its outer row.
- `full_count` for an unfiltered browse (bare or ACL-scoped) is served as a
  literal `SELECT <n>::int AS full_count;` with no bound params. It is the same
  number; the wire body is unchanged.

## Gate reconciliation

No frozen parity fixture replays a multi-hop ORDER path or a `full_count` SQL
STRING — the store holds read RESULTS — so **no re-harvest is needed**. Two
TS-native gates pinned the old spellings and are updated in the same commit:
`test/unit/search_path_acl_native.test.ts` (its `joinAliases` helper matched
only the `j_` namespace and would have reported zero joins for every ORDER-twin
leg — a vacuous pass) and `test/unit/search_count_shape.test.ts` (its
unfiltered-browse leg now asserts the cached literal; the count(*) vs
count(DISTINCT) law it exists for is asserted on the shapes that still emit a
counting query) and `test/unit/root_user_hidden_tripwire.test.ts` (its
full_count leg asserted the exclusion by finding `section_id > 0` in the
returned SQL, which a cached literal does not carry — it now asserts the
NUMBER, which is the thing that must never include root, against a re-derived
ground truth).

One ratchet SHRINKS in the same commit: `ws_a_tripwires`'s
`INLINE_SECTION_ID_MATCH_RATCHET` loses both search-builder entries, which
existed for the correlated `'!!'` self-join's `m2.section_id != <alias>.section_id`
SQL text — the text no longer exists.

New gates: `search_order_multilocator_native` (suite DB, the zzscale two-locator
record: the filter twin fans out, the order twin yields exactly one row and it is
the FIRST STORED locator — deliberately not the smallest target — and the two
chains hold different alias namespaces) and `list_count_budget_native` (suite DB,
measured through the engine's own query tap: a second identical paint issues ZERO
statements for the bare AND the ACL-scoped browse, a client-filtered count is
never cached, the key discriminates by ACL scope, and the key is a function of the bound values as well as the predicate text,
and the TTL floor expires a stamp).
