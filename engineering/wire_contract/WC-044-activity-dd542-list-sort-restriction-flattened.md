# WC-044 — Activity (dd542) list-sort restriction + flattened ordered-search SQL (2026-07-21)

Born of a production-scale incident: on a 32.9M-row / 85 GB `matrix_activity`
(dedalo7_mdcat), a list-header sort on the IP column ran **456 s** — the PHP
windowed shape `SELECT * FROM (SELECT DISTINCT ON (section_id) …, <jsonb sort
expr> … ORDER BY section_id) main_select ORDER BY <sort> LIMIT n` materializes
EVERY row (full scan + per-row `jsonb_path_query_first`) before the LIMIT can
apply. Two coupled changes:

- **Flattened ordered-search SQL (internal shape, wire-identical rows).** When
  an ordered SQO is single-section, join-free, and the target table carries the
  full UNIQUE `(section_id, section_tipo)` key (probed + cached —
  `tableHasUniqueSectionKey`; `matrix_time_machine`/`matrix_structurations`
  lack it and keep the windowed shape), `DISTINCT ON (section_id)` is a no-op
  and the assembler emits `ORDER BY <sort> LIMIT n` inline. Same rows, same
  order, same columns (verified plain + paged against the windowed shape);
  `section_id` sorts drop from ~10 s to ~1 ms (index-served), component sorts
  from 456 s to 77 s (parallel seq scan, still O(n)).
- **dd542 sort policy (structure-context wire change).** Arbitrary component
  sorts on the append-only log stay O(n) even flattened and are DISALLOWED:
  every dd542 column emits `sortable:false` EXCEPT When (dd547), whose order
  `path` maps to the direct `section_id` column (append-only ⇒ When-order ≡
  insertion order; `ACTIVITY_WHEN_TIPO`, order_path.ts) — the newest-first
  sort users actually want is index-served. Same policy family as the TM list
  (read_tm.ts maps header sorts to real columns and refuses the rest). The
  expression-index alternative was REJECTED (write amplification on the
  hottest insert path + rarely-used disk). dd542 left
  `list_column_sortable_differential`'s section loop (its oracle rows are
  history, ledgered in the test header).

### Gate

`test/unit/activity_sort_policy.test.ts` (When→section_id path, dd542-scoped —
other sections' date columns keep the jsonb path, sortable flags, unique-key
probe) + `test/unit/search_order_id.test.ts` /
`test/unit/search_late_row_lookup.test.ts` (flattened shape: no `main_select`,
no `DISTINCT ON`, inline ORDER BY + LIMIT/OFFSET).
