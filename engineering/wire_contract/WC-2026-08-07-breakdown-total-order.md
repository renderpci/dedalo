# WC-2026-08-07-breakdown-total-order — the inverse-locator BREAKDOWN orders by a TOTAL key

- **Date:** 2026-08-07 (landed with the two-plan breakdown split in
  `src/core/search/search_related.ts`).
- **Decision:** — (DEC-12 gate:
  `test/unit/search_related_breakdown_native.test.ts`, the
  "PAGINATION cuts through a tie group" case).

### Shape before (PHP, and TS until 2026-08-07)

`findInverseReferenceLocators` (SQO breakdown — PHP `sqo->breakdown`) emitted
the PHP order verbatim:

- `options.order === 'section_id'` → `ORDER BY section_id ASC`
  (PHP `build_sql_query_order_default`, no tiebreak);
- otherwise → `ORDER BY "table", section_tipo, section_id`.

Neither is a TOTAL order over a breakdown row set. A breakdown row is one
*locator entry*, not one record: the query cross-joins each owning row with
`jsonb_path_query(relation, '$.*[*]')`, so a single owner contributes as many
rows as it has matching entries — and those rows tie on **every** key of both
orders. `section_id ASC` additionally ties across owners in different sections
and tables.

Inside such a tie group the emitted sequence is whatever the chosen plan
happens to produce. Measured on the app DB (`dd128/4`, one locator,
`{order:'section_id', limit:7, offset:2}`, 12 executions): the pre-change code
returned **4 different pages** for the same call — and its `offset 2, limit 7`
window contained a row that its own `offset 0, limit 9` window did not. That is
not merely unstable pagination, it is *incoherent* pagination: the pages of one
result do not tile it.

### Shape after (TS)

Both orders keep their PHP keys, in place, and append a deterministic tiebreak:

- `'section_id'` → `section_id ASC, section_tipo ASC, "table" ASC, locator_data ASC`
- default → `"table", section_tipo, section_id, locator_data`

`locator_data` (jsonb, which has a total btree order) closes the order: two rows
that still tie after it are byte-identical and therefore unobservable — with one
residue, recorded below. The PHP keys come first and unchanged, so the ordering
they *did* determine is untouched — the divergence is confined strictly to what
neither key ordered.

#### Addendum 2026-08-08 — the jsonb order is total up to NUMERIC SCALE, not up to bytes

The "still tied ⇒ byte-identical" claim above is *almost* true, and the gap is
worth writing down rather than discovering later. jsonb compares numbers by
VALUE while its text rendering preserves SCALE, so two textually distinct values
can compare equal and be ordered arbitrarily against each other. Measured:

```sql
SELECT ('{"id":5.0}'::jsonb =  '{"id":5}'::jsonb) AS eq,   -- t
       ('{"id":5.0}'::jsonb <  '{"id":5}'::jsonb) AS lt,   -- f
       ('{"id":5.0}'::jsonb >  '{"id":5}'::jsonb) AS gt,   -- f
       ('{"id":5.0}'::jsonb)::text,                        -- {"id": 5.0}
       ('{"id":5}'::jsonb)::text;                          -- {"id": 5}
```

So the order is total over jsonb VALUES, not over the emitted bytes. To observe
it a caller would need one owner row whose `relation` holds two matching locator
entries identical except for the written scale of one number (`5` vs `5.0`), and
a page boundary falling between them. Dédalo writes locator `section_id` through
`encodeForJsonb` from a JS number, so no scale variant is produced by the engine;
the shape is reachable only via hand-edited or externally-imported jsonb.

Not a defect and not a reason to add a fourth sort key (`locator_data::text`
would order by rendering rather than by value, and would cost a cast per row on
every breakdown). Recorded so that a future "pages still don't tile" report has
somewhere to land: if it ever reproduces, the cause is scale-variant duplicates,
not the ordering rule.

Collation note (checked with the above): this install is `en_US.UTF-8`, a
deterministic libc collation, and PostgreSQL's `varstr_cmp` appends a bytewise
tiebreak — so the `section_tipo` and `"table"` text keys are themselves total and
add no comparable residue.

Same result set, same first-key sequence; the emitted order inside a tie group
may differ from what the PHP-shaped query happened to return.

### Reason

Two consumers paginate this call directly and are exposed to the tie order:

- `src/core/relations/models/relation_index.ts:155/216/328` — the relation_index
  portal page (`order: 'section_id'`, limit/offset);
- `src/core/section/indexation_grid.ts:1368` — the indexation grid, multi-locator,
  client-supplied `sqo.limit`/`sqo.offset`.

Without a total order a record at a page boundary could appear on two pages or
on none, and the page a user saw depended on which plan PostgreSQL had cached
for that prepared statement. The same non-totality also made the engine's own
two breakdown plans (the owner-carrier fast path and the inline semi-join
fallback) disagree on tie-bearing paginated shapes — reproduced 12/12 on
`dd128/67` and `dd128/66` — which is exactly the class the DEC-12 gate for the
split has to be able to see.

A tiebreak-free `ORDER BY` under LIMIT/OFFSET is a bug in any engine; in a
heritage system where the paginated list IS the finding aid, it is a
correctness bug, not a cosmetic one.

### Cost

The extra sort key on the largest unwindowed results (app DB, medians): 8,391
rows 137 → 142 ms, 9,958 rows 103 → 119 ms, 17,963 rows 203 → 226 ms (3-15%). A
windowed read pays a bounded top-N instead. No plan changed: `EXPLAIN (ANALYZE)`
on the fallback shape is node-for-node identical before and after, only the
`Sort Key` line differs.

### Gate reconciliation

- `test/unit/search_related_breakdown_native.test.ts` — the fixture seeds an
  owner (999911) that contributes two rows sharing every PHP key and differing
  only in `locator_data`, i.e. a real tie group. The pagination case asserts,
  for both orders and every window that cuts the group, that (a) the two plans
  return the identical row SEQUENCE and (b) each page equals the corresponding
  slice of the full ordered result (pages tile).
- No re-harvest. The frozen oracle store is unaffected:
  `test/parity/relation_index_get_data_differential.test.ts` and
  `test/parity/related_count_differential.test.ts` show the same failure set
  before and after the change (a pre-existing test-DB drift, verified by
  stash-diff), and no fixture records a tie-group sequence.
