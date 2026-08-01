# WC-012 — filter_by_list `format:'function'` maps the client's v6 function name to the v7 `data_*` twin (PHP errors on it)

- **Date:** 2026-07-09 (user report: the numisdata161 catalogue pre-filter
  "searches all type catalogues always").
- **Shape before (PHP):** the autocomplete pre-filter checkboxes send clauses
  `{q:'"<fct>_<st>_<si>"', format:'function',
  use_function:'relations_flat_fct_st_si'}` (v6 function names, baked into the
  byte-identical client). The PHP engine interpolates the name verbatim; this
  DB defines only the v7 `data_relations_flat_*` functions (install/db), so
  the query ERRORS and the picker returns **0 results** (probed live
  2026-07-09). The TS engine simply had no `format:'function'` handling, so
  the clause was silently ignored → UNFILTERED results (the reported bug).
- **Shape after (TS):** `conform.ts` resolves the clause through an explicit
  allowlist (`relations_flat_{st_si,fct_st_si,ty_st_si,ty_st}` → the `data_*`
  twins; `data_*` names accepted as-is) and emits
  `data_relations_flat_fct_st_si(alias.relation) @> $n::text::jsonb` with the
  flat key bound as a parameter (never interpolated; malformed keys contribute
  nothing; unknown function names throw loudly). The pre-filter now narrows
  correctly (numisdata309 catalogue 1 → 5425 / catalogue 2 → 2726 = SQL ground
  truth; ACIP-only picker returns 30/30 ACIP records).
- **Why:** functionality-over-parity (owner directive: autocomplete is a
  service, not stored data) — both engines were broken in different ways; the
  TS behavior is what the feature means. Upstream PHP should map the name or
  re-define the legacy functions.
- **Gate reconciliation:** no cross-engine equality is possible while live PHP
  errors — `search_filter_by_list_function.test.ts` asserts TS ground truth
  (counts vs direct EXISTS queries, allowlist throw, malformed-key drop).
- **Amendment (2026-07-20, implementation only — wire shape and result sets
  unchanged):** conform translates the allowlisted clause into an EXACT
  tuple-IN over the `matrix_relation_index` per-locator store — the flat key
  splits unambiguously on `_` (tipos never contain underscores) into the
  variant's typed columns, each a bound parameter. Equality pinned by
  `relation_index_store.test.ts` (index vs raw-jsonb counts) alongside the
  existing TS-ground-truth gate.
- **Amendment 2 (2026-07-20, same day — the flat functions are REMOVED):** the
  `data_relations_flat_*` stored functions, their GIN indexes and every SQL
  path that called them are gone (v7 ships no legacy relation engine; owner
  directive). The `use_function` names are from here on **wire vocabulary
  only**: the allowlist maps them to index-column layouts, nothing else. The
  index is required — an uncovered instance throws with the maintenance
  remediation (`search_store.ts` requireRelationIndex) instead of falling
  back. The v6→v7 update drops both name families (`relations_flat_*` and
  `data_relations_flat_*`) on closed installations; the install dump ships
  without them.
- **Amendment 3 (2026-07-21 — canonical leaf `format:'relation'`, legacy
  vocabulary DEPRECATED; owner directive: clean nomenclature for the clean
  implementation):** the wire shape the shipped client now emits is
  `{format:'relation', q: <partial locator object> | <array of them>, path}` —
  q fields are the locator vocabulary (`section_tipo` required, `section_id`,
  `from_component_tipo`, `type`), an array means OR within the leaf (the
  filter_by_locators semantics), strictly validated (unknown fields / bad
  tipos / non-integer id THROW; the new contract owes loud errors, not
  bug-compat). Both shapes emit the identical matrix_relation_index tuple-IN.
  `format:'function'` + `use_function` remains accepted as a DEPRECATED
  READER for beta-era saved searches; nothing in the tree emits it. Producer
  migrated: `view_default_autocomplete.js` filter_by_list checkboxes; zero
  occurrences of the legacy vocabulary exist in ontology data (probed
  2026-07-21). Gates: `search_filter_by_list_function.test.ts` (canonical
  single/array/strict cases + the legacy reader pins).
