# WC-2026-09-05-search-terms-are-literal — a curator's search term is text, never a program

- **Date:** 2026-09-05, adopted with the change that closes audit row P2-30-search
  (findings DATA-34, PERF-07).
- **Decision:** DEC-12 (the invariants land with their gates:
  `test/unit/search_pattern_escape_tripwire.test.ts`,
  `test/unit/search_literal_native.test.ts`,
  `test/unit/search_duplicated_uncorrelated_native.test.ts`).

## Shape before (PHP)

PHP's `trait.search_component_string_common` built its comparison as
`f_unaccent(value) ~* f_unaccent('<q>')` with the curator's term interpolated
raw, and the TS port copied it faithfully — the term travelled as a BOUND
parameter (which closed the injection question) into an operator Postgres
compiles as a POSIX REGULAR EXPRESSION (which did not close the meaning
question). The same hole was in all three families: `builder_string`,
`builder_json` and `builder_iri`. Only `builder_iri` escaped anything, and only
the dot (`PHP :547`).

`'!!'` (duplicated values) was PHP's `resolve_duplicated_sql`: a CORRELATED
`EXISTS` whose inner `FROM` cross-joined the whole matrix table with two
`jsonb_path_query` calls, re-executed once per outer row.

## Shape after (TS)

1. **The escape is SQL, on the far side of `f_unaccent`.** Every `~*` operand in
   every builder is now `f_regex_literal(f_unaccent(_Qn_))`
   (`src/core/search/builders/types.ts` `regexOperand` — the one point where a
   search string becomes a pattern), where `f_regex_literal(text)` is an
   IMMUTABLE SQL function declared in `src/core/db/db_pg_definitions.json` and
   applied to existing installs by
   `install/db/migrations/0009_search_literal_escape.sql`.

   **THE ORDER IS THE WHOLE POINT.** Every operand is normalized with
   `f_unaccent`, i.e. Postgres's own `unaccent` dictionary, and that dictionary
   EXPANDS characters INTO metacharacters: `×`→`*`, `©`→`(C)`, `…`→`...`,
   `∖`→`\`, `¿`→`?`, `±`→`+/-`, `⁅`→`[`, `‖`→`||`, `⑴`→`(1)`, `％`→`%` — 143
   characters in the shipped rules, measured. An escape performed in TypeScript
   runs BEFORE that expansion and therefore neutralises metacharacters that do
   not exist yet: measured on the suite database, `Museo © 1998` compiled as
   `Museo (C) 1998`, matched `Museo C 1998` and did NOT match the record that
   literally says `Museo © 1998`; `12 × 8` raised
   `invalid regular expression: quantifier operand invalid`. The term travels
   RAW as a bound parameter and is made literal in SQL — the only order under
   which the pattern Postgres compiles is the text the curator typed.

   **BOUNDARY:** only the operands of `~*`. The equality shapes (`=`, `==`, a
   quoted literal) compare with `=` and keep the plain `f_unaccent(_Q1_)` —
   escaping them would break exact search. Anchors compose OUTSIDE the escaped
   operand (`'^' || f_regex_literal(f_unaccent(_Q1_))`), and Dédalo's own
   wildcard `*` is stripped BEFORE binding: it is a Dédalo wildcard, not a regex
   one. A DIRECTLY TYPED `*` or `+` is therefore still grammar, not a searchable
   character — but both are now reachable through their unaccent pre-images
   (`⁎`, `＋`), which the pre-image census measures end to end.

2. **The store pre-filter's regex-plainness veto is GONE.** It existed because
   the exact predicate was regex-semantic while the trigram superset is
   literal-substring — they could only agree on plain text. Now that the exact
   predicate is literal for every term, the two agree always: the raw term
   drives `LIKE` through `f_like_literal(lower(f_unaccent(_Q0_)))` — LIKE's own
   class (`\`, `%`, `_`) escaped on the SAME side of `f_unaccent`, because the
   dictionary expands `％`/`﹪` to `%` and `＿` to `_` — and the same raw term the
   exact predicate. A term carrying a metacharacter is trigram-served instead of
   falling back to the classic scan.

3. **`'!!'` is ONE UNCORRELATED SELF-AGGREGATE**, materialised once per query: a
   lang-projected values subquery grouped by (section_tipo, value), keeping the
   groups that hold more than one distinct `section_id`, asked as
   `(alias.section_tipo, alias.section_id) IN (…)`. Membership is a TUPLE, not a
   bare id: a duplicate pair in another tipo of the same physical table must not
   drag a same-numbered record in. `builder_json` carries the identical shape;
   `builder_iri`'s `'!!'` stays the declared uncovered throw.

   `matrix_string_search` is used ONLY as a superset pre-filter, and only when
   the comparison is lang-blind (`lang === 'all'`): the store has no lang column
   (`db_pg_definitions.json`) and **none is added here** — a schema change would
   collide with P2-34's seed equality.

## Reason

A curator searching `Denarius [sic]` was handed a character class: the term
matched every value containing `s`, `i` or `c` — on the zzscale corpus, all 16
string records instead of the 1 that says `[sic]`. A curator searching
`Sestertius(mark` got a regex SYNTAX ERROR raised by the database and surfaced
as an internal failure. Neither is a performance question: a heritage catalogue
whose titles carry `[sic]`, `(?)`, `c. 100 B.C.` and `S(enatus) C(onsulto)` was
answering the wrong question, silently, for every one of them.

`'!!'` was O(n²) jsonpath evaluations — not slow but unfinishable at museum
scale, and the shape does not depend on the outer row at all.

## Consumer impact

- A search whose term carries a regex metacharacter now returns the records that
  literally contain it. That IS the change: any client or saved preset that
  relied on a term being interpreted as a pattern gets a different (correct)
  answer. Nothing shipped does — the client sends what the curator typed.
- A term that used to raise an internal error now answers.
- `'!!'` returns the same records; only the plan changes.
- `'*'` and `'+'` remain grammar and remain unsearchable, exactly as before.

## Gate reconciliation

No frozen parity fixture replays a metacharacter term or a `'!!'` search: the
2026-07-11 harvest holds successful reads of plain terms, so **no re-harvest is
needed**. The TS-native gate that PINNED the old pre-filter veto,
`test/unit/search_store_prefilter.test.ts`, is updated in the same commit — its
"metacharacters suppress the pre-filter" leg is inverted to "metacharacters KEEP
the pre-filter", and its LIKE-escape leg now asserts the escape ON THE DATABASE
(`f_like_literal` makes `%`/`_` literal) instead of a TypeScript-side spelling,
with the reason inline. `test/unit/search_json_builder.test.ts` re-points its
three emitted-SQL spellings to the escaped operand. `test/unit/zzscale_corpus_native.test.ts`
re-points its `REGEX_META` anchor from `builder_string.ts` to `types.ts` (same
constant name, same derived list).

New gates: `search_pattern_escape_tripwire` (hermetic — a TOTAL census over the
builders that emit `~*`, derived from the tree with a floor, asserting every
operand is escaped AFTER normalization and binds the RAW term, plus the equality
boundary, a positive control, and that both SQL functions are declared AND
carried verbatim by a boot migration), `search_literal_native` (suite DB, the
zzscale corpus: a TOTAL census over the declared metacharacter class, each
matching its own value alone; a TOTAL census over the LIVE unaccent dictionary's
expanding class — self-match, two decoys, and the query compiling at all; and a
PRE-IMAGE census reaching every declared metacharacter through the whole search
path; and an ANCHORED census — the same class, typed directly and as its
pre-image, asked begins-with and ends-with, because the wildcard arms build a
DIFFERENT operand (`'^' || f_regex_literal(f_unaccent(_Q1_))`) and a
TypeScript-side escape re-added there would return NOTHING for any anchored term
carrying a metacharacter while every contains census stayed green)
and `search_duplicated_uncorrelated_native` (suite DB: the answer,
section-, lang- and valueless-exactness, and the absence of a per-row `SubPlan`
in the PLAN).

The two SQL functions ride BOTH lanes on purpose: declared in
`db_pg_definitions.json` (what the maintenance "rebuild functions" action
recreates) and created by the numbered boot migration (what an existing install
applies on its next start). Without the migration a running install would answer
every contains search with `function f_regex_literal(text) does not exist`.
