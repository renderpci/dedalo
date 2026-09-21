# WC-2026-09-01-children-recursive-search — the descendant-expanding search, and the two places it answers differently from PHP

- **Date:** 2026-09-01, adopted with the port of `sqo.children_recursive` into
  the TS search assembler.
- **Decision:** DEC-12 (the invariant lands with its gate:
  `test/unit/search_children_recursive_native.test.ts`).

## Shape before (TS through 2026-08-31): the flag did nothing

`children_recursive` was accepted by the SQO schema
(`src/core/concepts/sqo.ts:146`), survived `sanitizeClientSqo`, and was merged
into the stored session SQO (`SESSION_SQO_MERGE_KEYS`). Nothing read it. A
search asking for a thesaurus BRANCH therefore answered with the branch node
alone.

That is not an abstract gap. It is what `tool_numisdata_epigraphy`'s glyph grid
does for a living: the epigraphy autocomplete's secondary request_config sends
`children_recursive:true` pinned to the picked term, and the grid renders one
`component_svg` per returned record. Picking "Síl·labes" produced a grid with a
single empty cell instead of that syllabary's glyphs.

## Shape after (TS): PHP's two-pass expansion, ported

`buildSearchSql` dispatches on the flag into `buildChildrenRecursiveSql`
(`src/core/search/sql_assembler.ts`), mirroring PHP `search::search` :445-511 →
`search_children_recursive` :585-660 → `generate_children_recursive_search`
:663-707:

1. **the roots** — the SAME sqo with `children_recursive:false` and no
   pagination (`limit:'all'`, `offset:0`), through this same assembler, so every
   gate the normal path applies (projects filter, `filter_records`, the SEC-02
   frontier scope, the Users `-1` hide) applies here too;
2. **the descendants** — `getChildrenRecursiveBatch`
   (`src/core/relations/children.ts`), the SHARED-visited batch walk, which is
   the twin PHP's search path calls (`get_children_recursive_batch` →
   `get_children_recursive_shared`, one `&$visited` for the whole batch). Not the
   by-value `getChildrenRecursive`: with an unpaginated root set straight from a
   client SQO, a per-path visited set re-expands every shared subtree once per
   path — O(N·depth) at best, exponential on a polyhierarchy, and each expansion
   pays an index query plus per-child record reads to resolve child order;
3. **the combined search** — a rebuilt SQO whose filter is
   `(fixed_children_filter) AND (section_id IN roots+descendants)`, with
   `filter_by_locators` dropped (the roots are already resolved; leaving the pin
   in would re-narrow the answer back to the roots). The caller's own `filter`
   is replaced wholesale, exactly as PHP does — it selected the roots, and the
   subtree is what the caller asked for.

## The two DELIBERATE divergences

**(a) A childless root keeps the CALLER's limit and offset.** PHP returns its
unbounded parents result in that branch (`search_children_recursive` :620-632,
`seek(0)` on the pre-search whose limit was forced to `'all'`), so a request for
page 3 of 25 came back as every matching root. TS re-runs the plain search with
the caller's own pagination. A pre-search's pagination is an implementation
detail of the pre-search; leaking it to the caller is a bug, not a contract.

**(b) `full_count` is preserved instead of forced false.** PHP sets
`full_count:false` on the rebuilt SQO and hands the total out of band through
`sqo->total = count(parents + children)` (`trait.count.php` :92-110). TS lets the
count path run the expanded query with `full_count:true`, so the total is the
number of rows that actually match — the id list AND the fixed filter AND every
ACL clause — rather than the length of the id list before filtering. Where they
differ, PHP over-counted.

Neither divergence is visible as a SHAPE change: the response body is the same
`{context, data}` a section read always emits. What changes is which rows and
which total a `children_recursive` request gets.

## Inherited oracle behaviour, recorded here rather than fixed

The merged id list becomes ONE `component_section_id` filter carrying a single
`path[0].section_tipo`, while the sqo's `section_tipo` scope is unchanged. Under
a MULTI-section sqo that means (i) a descendant living in a section outside the
scope is silently dropped, and (ii) an id can select an unrelated record that
happens to carry the same `section_id` in another scoped section. PHP is
bit-identical here (`generate_children_recursive_search` :675-691 builds the same
single list from `$ar_rows[0]->section_tipo`), so this is parity-correct porting
of an oracle defect, not a divergence. The projects filter still applies, so it
is a correctness limit, never an ACL leak. Single-section is the only shape any
current caller sends.

## Gate reconciliation

- New gate: `test/unit/search_children_recursive_native.test.ts` — builds a
  `test`-TLD subtree (including a two-parent DIAMOND) and pins: the flag expands
  to every depth; the same sqo WITHOUT it answers with the root alone;
  `fixed_children_filter` narrows the expanded set; divergence (a) as a paging
  outcome; divergence (b) as a count; and the shared-visited property as an
  outcome — a grandchild under a two-parent node comes back once.
- **No re-harvest is needed.** The frozen oracle store holds harvested READ
  responses and none of them carries `children_recursive`, so no fixture's bytes
  change; the flag was inert before this change, so no gate was pinning the old
  answer.
