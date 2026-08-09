# WC-2026-08-09-autocomplete-hi-ancestor-search — the thesaurus ancestor index is READ on search (and its negation grouping is corrected)

- **Date:** 2026-08-09 (audits/2026-08_oh1_beta REPORT §5.5, WS-5 "Search
  correctness": *"Thesaurus broader-term search silently under-returns. The
  `autocomplete_hi` `relation_search` ancestor index is maintained on save but
  never queried on read — `buildRelationSearchAncestorFragment` is dead code,
  with no WC entry and an unblock condition unreachable post-decommission."*)
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (tripwire in the same
  change).

## What was wrong

Every save of a legacy `component_autocomplete_hi` writes the target term's
recursive PARENT locators into the `relation_search` column
(`src/core/section/record/save_component.ts` → `relations/save.ts`
`maintainRelationSearchIndex`). That index exists so that searching a BROADER
term returns the records filed under its NARROWER ones — "search Spain, match
Madrid", the v6 behaviour curators rely on for a thesaurus.

Nothing ever read it. `buildRelationSearchAncestorFragment` existed, was
correct, was unit-gated, and was deliberately withheld from the live dispatch
with the note "wire it when PHP fixes the wrap". PHP was decommissioned on
2026-07-11, so that unblock condition can never be met, and the withholding
became permanent. A broader-term search therefore returned FEWER records than
v6 with no error — the curator cannot tell a narrow result from a complete one.

## Shape before (PHP, `add_relation_search`)

`trait.search_component_relation_common.php:512` clones the clause, repoints the
clone at `relation_search`, and groups the pair:

| operator | grouping | clone's column |
|---|---|---|
| `==` | `$or` | **`relation`** (the clone's `component_path` is left untouched) |
| `*`, `!==` | `$or` | `relation_search` |
| `!=`, `!*` | `$and` | `relation_search` |

Two of those rows are defects PHP's own comment half-admits:

1. **`==` never reads the index.** The `if ($q_operator!=='==')` guard skips the
   repoint, so both halves of the `$or` search `relation` — on the ONE operator
   the picker actually sends. PHP's comment: *"This appears to be an oversight."*
2. **`!==` is grouped with `$or`.** `NOT direct OR NOT ancestor` is true for a
   record that IS contained in `relation` whenever it is absent from
   `relation_search` — i.e. "different from X" returns records equal to X.

## Shape after (TS)

`conform.ts` applies the wrap whenever the leaf's **stored** ontology model is
`component_autocomplete_hi` — the same test the WRITER uses, so the read side
covers exactly the components whose index is maintained. (The relations registry
dispatches on the RUNTIME model, where `component_autocomplete_hi` has already
been replaced by `component_portal`; PHP resolves the same question with
`ontology_node::get_legacy_model_by_tipo`.) `matrix_time_machine` /
`matrix_activity` are excluded: their relation datum is the scalar `user_id`
column and no ancestor index exists there.

```
positive ('', '==', '*')   →  $or  [ relation-clause, relation_search-clause ]
negating ('!*', '!=', '!==') →  $and [ relation-clause, relation_search-clause ]
```

The clone ALWAYS targets `relation_search` (correction 1), `!==` is grouped with
`$and` (correction 2), and the `!=` ancestor clause uses the STRICT
not-contains form `!==` rather than `!=`:

3. PHP's `!=` also demands `relation_search ? <tipo>`. A record whose term is a
   hierarchy ROOT has no ancestors, so its `relation_search` key is DELETED
   (`relations/save.ts:368-375` passes `null`, which `updateMatrixKeyData`
   turns into a delete_key) — and PHP's grouping then drops it from every `!=`
   result. That is the same class of silent under-return this entry closes, so
   the ancestor half asks only "does not contain", never "has the key and does
   not contain". Measured read-only on the live `dedalo7_mht` archive: **69
   `oh1` records** carry an `oh19` (a component_autocomplete_hi) relation with
   no `oh19` key in `relation_search` — 69 records PHP hid from every `!=`
   search.

4. **NULL-SAFETY ON THE NEGATING ARM.** `relation_search` is written only for
   terms that HAVE ancestors, so the whole COLUMN is NULL on most rows —
   measured read-only on `dedalo7_mht`: **1964 of 2175 `matrix` rows**, and 72
   of 76 `oh1` records. Under three-valued logic `NOT (NULL @> q)` is NULL, not
   TRUE, so the `$and` of [direct, ancestor] evaluates to NULL for every such
   row and the row silently vanishes: a strict-different (`!==`) search over
   `oh1` returns **4 of the 76 records it must**. A NULL index means "this
   record has no indexed ancestors", never "unknown", so the negating arm
   compares against `COALESCE(<alias>.relation_search, '{}'::jsonb)`. PHP has
   no such guard and swallows the same rows, so this is a divergence from
   PHP-as-shipped rather than a port of it.

   Applied ONLY to the negating arm. A negation cannot ride
   `matrix_relation_search_gin_idx` in any case, so nothing is lost there; the
   POSITIVE arm keeps the bare column, stays index-served, and is already
   NULL-safe because `$or` absorbs a NULL beside a TRUE. The expression reaches
   the shared relation builder through the new `BuilderContext.columnExpr`,
   built from already-gated identifiers only — never from leaf input, so the
   builders' security invariant is unchanged.

   *Recorded 2026-08-09, in the remediation wave that followed the wrap's first
   landing: correction 4 was NOT in the wrap as first shipped, and without it
   the wrap traded one silent under-return for a much larger one.*

## Reason

Functionality: a maintained-on-write index that is never read is a silent
wrong-answer machine in a research archive, and the frozen oracle cannot be
consulted on the question any more. Corrections 1-3 are each a
strictly-more-correct reading of PHP's own stated intent (its docblock describes
$or/$and exactly as implemented here), not new behaviour invented for TS.
Correction 4 has no PHP counterpart at all: it is the arithmetic of the `$and`
this entry introduces, and the wrap is not safe to run without it.

Performance: `relation_search` carries a `jsonb_path_ops` GIN index on `matrix`
and on `matrix_test` (`matrix_relation_search_gin_idx`), so the added `$or` arm
is one more index probe, not a scan.

## Gate reconciliation

- `test/unit/search_date_and_ancestors_native.test.ts` — "broader-term search
  reads the maintained ancestor index": a scratch `test3` record links the
  NARROW term cl1/39 and carries the parent chain (cl1/33, cl1/3, cl1/1) in
  `relation_search`, in the byte shape verified read-only against the live
  `dedalo7_mht` install (`oh1/72.relation_search.oh19`,
  `rsc197/1.relation_search.rsc92`). A search on the root cl1/1 must return it;
  the direct term must still return it; a plain `component_portal` leaf on the
  same section must NOT be wrapped; `!==` must group with `AND` and exclude it.
  RED before this change (the rendered SQL never mentioned `relation_search`),
  green after.
- **Every correction above is gated in that same file** (added in the
  remediation wave — corrections 3 and 4 were ledgered before they were
  gated, which is the gap this closes):
  - correction 3 — *"'!=' keeps hierarchy-ROOT records, which PHP's key test
    dropped"*: a second scratch record (`test3`/998802) holds the ROOT term
    cl1/1 with the `test205` key absent from `relation_search`. A `!=` search
    must return it; the same test then runs **PHP's own shape as a fossil**
    against the identical rows and asserts it drops the record.
  - correction 4 — *"'!==' still returns rows whose relation_search is NULL"*
    (the canonical playground rows are exactly that population) plus *"the
    POSITIVE arm keeps the bare column, so it stays GIN-index-served"*, which
    pins the COALESCE to the negating arm only.
  - the `!*` `$and` grouping — *"'!*' groups with AND, so a record with a term
    is never 'empty'"*.
  Each was observed RED with its correction reverted, for its own reason.
- `test/unit/relation_search_builders.test.ts` keeps its direct unit pin of the
  builder. Its header text ("deliberately NOT live") is now stale — see the
  handoff in the same change.
- `src/core/relations/registry.ts` no longer claims the wrap is "deliberately
  NOT wired"; it now records WHY the dispatch cannot live there (the registry
  sees the RUNTIME model, by which point component_autocomplete_hi has become
  component_portal) and points at conform.ts.
- **No re-harvest.** The frozen store carries no autocomplete_hi search fixture,
  and there is no live oracle to diff against; the PHP shape above is recorded
  from the frozen source, as a fossil.
