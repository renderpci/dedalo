# WC-2026-09-24-multi-section-search-identity-dedup — a multi-section search returns each record ONCE and counts records, not ids

- **Date:** 2026-09-24.
- **Decision:** DEC-12 (the invariant lands with its gate:
  `test/unit/search_multisection_deep_path_dedup_native.test.ts`).

## Shape before (PHP, ported verbatim)

PHP `search::__construct` (`class.search.php:397`) forced `remove_distinct` for
every multi-section SQO: `DISTINCT ON (section_id)` would have merged two
sections' records that share an id (es1:5 and fr1:5). The row SELECT then
carried NO dedup at all. That was harmless without joins, but a multi-hop filter
path unnests the hop's locators (`LEFT JOIN LATERAL jsonb_array_elements`), so a
record with N matching locators came back N times.

The multi-section `full_count` was `count(DISTINCT mix.section_id)`: the
cross-section merge PHP avoided for rows, applied to the total. Records sharing
an id across the searched sections were counted once.

## Shape after (TS)

`src/core/search/sql_assembler.ts` `buildPlainSearchSql`. **Record identity is
(section_tipo, section_id), never section_id alone.**

1. Rows: multi-section WITH a join chain selects
   `DISTINCT ON (mix.section_id, mix.section_tipo)`, and its default inner order
   is `section_id ASC, section_tipo ASC`. section_id stays the page's primary
   key, so pagination order is unchanged; ties between sections become
   deterministic. Multi-section without joins stays DISTINCT-free, because a
   matrix table already yields one row per identity. In a UNION ALL each branch
   dedups its own table, and the branches are disjoint.
2. Count: multi-section counts `count(DISTINCT (mix.section_tipo,
   mix.section_id))`. Single-section with joins keeps
   `count(DISTINCT section_id)` (the tipo is pinned).

## Reason

A search result is a set of records. A row repeated per matching locator is an
artefact of the SQL, not data, and a total that merges distinct records is a
wrong number. Both made the paginator disagree with the rows it paged.

## Consumer impact

- Multi-section lists and searches with a deep filter path (thesaurus
  multi-hierarchy search, MCP search, diffusion selections, section list pages)
  no longer show duplicate rows, and pages hold `limit` distinct records.
- A multi-section `full_count` rises wherever the searched sections share
  section_ids; it now equals the number of rows the search can serve.

## Gate reconciliation

No frozen parity fixture replays a multi-section SQO with a multi-hop filter
path (scanned 2026-09-24: 0 hits across `test/parity/fixtures/oracle_harvest/`).
The fixture store holds read RESULTS, not count SQL, so **no fixture changes**.
The failing-test names of `sqo_differential`, `projects_filter_differential` and
`autocomplete_hi_search_differential` are identical before and after.

One TS-native gate pinned the old spelling and changes in the same commit:
`test/unit/search_count_shape.test.ts`, whose multi-section leg asserted
"cross-tipo collapse parity" and now asserts the identity count.
