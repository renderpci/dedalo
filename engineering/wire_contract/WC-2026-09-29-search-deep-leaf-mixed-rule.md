# WC-2026-09-29-search-deep-leaf-mixed-rule — a deep filter leaf is a semi-join over the related records; sibling positives on different fields share one record

- **Date:** 2026-09-29 (`src/core/search/deep_path.ts`, `src/core/search/conform.ts`,
  `src/core/search/builders/*` classifiers, `src/core/search/sql_assembler.ts`).
- **Decision:** owner decision 2026-09-29 — the MIXED RULE for same-path
  conditions (below). It replaces the 2026-09-24 choice of fully independent
  matching recorded on the parked, never-merged branch
  `wip/deep-search-semijoin` (f700760d44), whose operator-polarity design
  (classifiers, positive twins, the neq split, D2, D3) this entry adopts. That
  branch's relation-index schema change (source_table, freshness epochs, store
  guards, `DEDALO_SEARCH_DEEP_REVERSE`) is NOT adopted: no schema changes.

## Semantics

A filter leaf with `path.length > 1` answers over R(m) = the related records
main record m reaches through the path (any stored locator at every hop; a
record the caller may not read at a hop — SEC-02 — is absent):

- **pos** — some r in R(m) matches.
- **neg** — no r in R(m) matches the positive twin: `'-x'`, `'!*'`, `'!=='`,
  relation_index/children `'!*'`, json `'-x'`, section_id `'!=n'` (D2: "no
  related record has id n", TRUE when there is no relation).
- **neq** — some r in R(m) has a value AND no r in R(m) matches the twin:
  `'!='` for string/iri/json/number/relation/relation_children.
- Records with no relation, or only dangling / hidden targets, satisfy every
  neg leaf and no pos leaf.
- q_split tokens of ONE leaf: positive tokens must all match the same related
  record; each negative token is its own "none" (`'-a b'` = no related record
  contains a AND none contains b — D3).
- `$not`/`$nand`/`$nor` negate the whole semi-join.
- The polarity of every operator is declared ONCE, by each builder family's
  exported `classify<Family>()`, which the builder itself dispatches on.
- Two deep negations deliberately read differently from the same operator on
  a SHALLOW leaf (one record, no hop), because "no related record matches" has
  no has-guard:
  - json `'-x'`: shallow = the record has entries AND none contains x; deep =
    no related record contains x (a record with no related json entry
    matches). Deep json `'!='` keeps the has-half (neq), so on a deep path
    json `'-x'` and `'!=x'` differ, while shallow they are byte-identical.
  - date `'!*'`: shallow `NOT (col @? path)` is NULL on a NULL `date` column,
    so that record is NOT "empty"; deep, a related record with a NULL `date`
    column holds no value, so it does not stop the NOT EXISTS twin (`'*'`)
    from matching "empty".

### The mixed rule (sibling leaves of an AND connective on the same path)

Applies inside `$and`, and inside `$not`/`$nand` (whose items are ANDed):

- all-positive leaves on DIFFERENT fields share ONE related record — their
  predicates are ANDed inside a single semi-join ("a movement to Madrid in
  1939");
- if a field repeats among them, every one of them is matched independently
  ("a movement to Madrid AND a movement to Valencia" — the final-PHP 2518d2059c
  conjunction);
- a leaf with a negated clause (neg/neq, or a q_split negative token) never
  shares: a negation always means "no related record matches".

Under `$or`/`$nor` every leaf is independent (EXISTS distributes over OR, so
sharing would change nothing for positives and would change negations).
"Same path" = the identical hop chain; a longer path sharing only a prefix is
independent.

## Shape before (PHP)

Final PHP 2518d2059c (2026-06-15): a per-clause `join_id` gave every multi-step
clause its own LEFT JOIN chain (same-path AND matched across related records);
negation was evaluated per fanned row.

## Shape before (TS)

Path-deduplicated `LEFT JOIN LATERAL` fan-out in the main FROM: every leaf on
one path tested on the SAME joined row, so same-field AND could never match
(`alpha AND beta` over one text field); negation meant "some related record
fails" (mdcat `'-NIF'` 38,749 records, correct 18,635); `count(DISTINCT …)`
and DISTINCT ON over the fan-out. deep_path.ts (b8731e2335) reversed only the
positive leaves it could prove identical to that forward join.

## Shape after (TS)

No deep leaf ever joins the main FROM. Each unit renders as:

- **reversed** — `(main.section_tipo, main.section_id) IN (SELECT … FROM
  matrix_relation_index … IN (SELECT leaf records WHERE <P>))`: a POSITIVE
  semi-join in a positive context whose source tables the index covers (all
  UNION branch tables included);
- **forward** — `[NOT] EXISTS (SELECT 1 FROM jsonb_array_elements(<hop>) …
  JOIN <step table> … ON <locator identity> AND (<hop ACL>) WHERE <P>)`: every
  negated clause, anything under a negating group, and uncovered tables.
  The join text is the one `buildJoinChain` declares per hop (`JoinHop.join`).

The count is `count(*)` (no fan-out). The filter chain's hop ACL binds through
named tokens (`NamedTokenCollector`, `_ACLn_`), substituted only when the
semi-join renders — a refused (`1=0`) or inert leaf opens no hop and leaves no
orphan `$N`. A refused leaf therefore reads nothing of the hidden record at all
(before: its join chain was still emitted). The deep `'!!'` duplicate
aggregate reads the last step table restricted by that hop's record ACL.

## Reason

Correct heritage semantics ("records with no NIF document" must not return
records that hold one); the same-field conjunction users build from the search
panel; one row per record without DISTINCT.

## Gate reconciliation

- `test/unit/search_deep_semantics_native.test.ts` — the semantics above,
  record sets on a built situation (pos, neg, neq for text and number, `$not`,
  the mixed rule's four cases, q_split, `$or`).
- `test/unit/search_deep_path_reverse_native.test.ts` — rewritten: which shape
  each case takes and its answer (same-field `$and` now independent; `'!*'` and
  `$not` are NOT EXISTS, their answers fixed).
- `test/unit/search_count_shape.test.ts` — the `'!*'` deep count is `count(*)`.
- `test/unit/search_path_acl_native.test.ts` — the dd128 census: refused leaf
  opens no hop; with the grant, the users rule rides the hop alias.
- `test/unit/builder_shallow_snapshot.test.ts` — shallow builder SQL
  byte-identical (fixture captured 2026-09-24 from the builders HEAD still had
  unchanged) except number `'!='` (WC-2026-09-29-number-not-equal).
- Frozen fixtures: none edited, none re-harvested. The multi-hop parity gates
  replay corpus-bound gates (engineering/ORACLE_HARVEST.md); a deep negation
  or same-field AND there now answers the corrected set.
