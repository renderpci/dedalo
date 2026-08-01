# WC-055 — Unindexed searches: the redundant `@?` pre-guard removed, and the statement-timeout ceiling made usable (2026-07-27)

Two changes on the same theme — a search we deliberately do NOT index must still
be cheap per row and bounded in total. Neither changes any result.

**The `@?` pre-guard on the POSITIVE exists-envelope (SQL only, same rows).**
`builder_json` and `builder_iri` emitted
`(col @? '$.<tipo>[*]') AND EXISTS (SELECT 1 FROM jsonb_path_query(col, …) …)`.
The guard cannot change the result: `jsonb_path_query` is STRICT, so a NULL
column or a path yielding no element produces no rows and the EXISTS is already
false. It was a second full jsonpath evaluation of the same path on the same
document, per row. Measured on the dd551 Data search over the 32.9M-row mdcat
`matrix_activity` — the shape that CANNOT abort early, a term matching nothing,
so it reads everything — 200k rows: **2854 ms → 1059 ms (2.7x)**; extrapolated
to the full table ~470 s → ~175 s. Removed from `existsEnvelope` in both
builders only. It is LOAD-BEARING elsewhere and stays: `!=`/`-` is
`(col @? path) AND NOT EXISTS (…)` = "has entries but none match" (without it
every record lacking the component would match), and `*` not-empty IS the guard.

**Why dd551 is not indexed at all** (the decision this entry records, so it is
not silently revisited): the only index that could serve
`f_unaccent(elem->>'value') ~* f_unaccent($1)` is a trigram GIN over an
expression on `misc`, maintained on EVERY activity insert — the hottest write
path in the system, the write amplification WC-046 set out to remove — to serve
a column that is searched rarely, and whose COMMON-term search already answers
in 0.3 ms (the matches are recent, so the ordered walk aborts early). Only the
no-match term is slow. The residual cost is accepted and bounded, not indexed.

**`DB_STATEMENT_TIMEOUT_MS` made usable (`runWithoutStatementTimeout`).** The
ceiling is the only bound on that residual: an unindexed `~*` over 33M rows
cannot abort early, and a client disconnecting does NOT cancel it (verified the
hard way — probe queries orphaned by a killed `psql` were still burning CPU 24
minutes later). The setting nevertheless shipped disabled and unused, because it
is a per-connection GUC on the SHARED pool and the same ceiling would abort
REINDEX / VACUUM / DROP INDEX CONCURRENTLY — maintenance that is SUPPOSED to run
for minutes. Those statements now opt out explicitly through a RESERVED
connection (`core/db/postgres.ts`), so the ceiling can finally be set for the
request traffic it exists to protect: `db_assets.optimizeTables` (REINDEX +
VACUUM per table), `pruneMatrixIndexes` (DROP INDEX CONCURRENTLY),
`execMaintenance` (the `ar_maintenance` sentences, incl. VACUUM FULL), and the
Database-info widget's whole-database VACUUM ANALYZE. The GUC is cleared on a
reserved connection, never a pooled one: a plain `SET` persists for the life of
the connection, so issuing it on the pool would silently un-bound every later
request handed that same connection.

### Gate

`test/unit/search_exists_envelope_guard.test.ts` — the asymmetry (positive
envelope carries no `@?`; `!=`/`-` and `*` keep theirs) PLUS a row-level
equivalence proof against the live planner over NULL / empty-array /
missing-component / object-valued rows · `test/unit/statement_timeout_exemption.test.ts`
— a ceilinged statement IS cancelled, the helper's is not, and the cleared GUC
does not leak back into pooled traffic.
