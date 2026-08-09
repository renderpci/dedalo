# WC-2026-08-09-media-index-target-selection — the media-marker rebuild indexes every real table, and only the real ones

- **Date:** 2026-08-09 (defect-ledger D12; the fix and this entry land together).
- **Decision:** — (DEC-12 gate: `test/unit/diffusion_graph_native.test.ts`,
  the `selectMediaIndexTargets` block).

### What changed

`selectMediaIndexTargets` (`src/core/diffusion_bridge/diffusion_graph.ts`)
turns a section's diffusion targets into the `(database, table, section)`
triples that the `.publication` marker store is rebuilt from
(`rebuild_media_index` → `src/diffusion/targets/mediastore/media_index.ts`).

It keyed its per-section selection on **`database_name` alone**. A database
that publishes TWO REAL tables therefore contributed exactly ONE of them: the
second table's published rows got **no media markers at all**, so every media
file whose record lives only in that table is denied (or, symmetrically, never
published) by `media_protection` — broken media on the public site, for a whole
table, with nothing in any log. The key is now
**`${database_name}|${table_name}`**.

### Shape before (PHP)

`dd_diffusion_api::resolve_media_index_targets`
(`v7_php_frozen/master_dedalo/core/api/v1/common/class.dd_diffusion_api.php`)
dedupes on the **`database|table|section` triple** and emits every triple it
finds. It has NO per-database collapse and NO real-vs-alias preference.

### Shape after (TS)

Per section, in first-seen order:

- every distinct `(database, table)` pair is emitted — this RESTORES the PHP
  behaviour and is the D12 fix proper;
- **minus** the `table_alias` tables of any database that also publishes to a
  REAL table;
- **minus** every alias after the first in a database that has no real table.

The alias rules are the DIVERGENCE this entry exists to record: PHP emits alias
tables as targets of their own, TS suppresses them. The rule was already in the
code (as a comment, unledgered) before this change; only its key moved from
per-database to per-(database, table).

### Reason

The engine only ever WRITES to the real table — a `table_alias` node names a
MariaDB alias/view over rows the engine published elsewhere. Indexing it a
second time produces markers for a table name no publication reader asks for,
at the cost of a full extra scan per rebuild. Keeping the first-alias fallback
means a section published ONLY through an alias is still indexed rather than
silently skipped.

What was NOT defensible is paying for that preference with a lost real table,
which is what the `database_name` key did. The two rules are independent: real
tables are a set, aliases are a fallback.

### Gate reconciliation

**No fixture re-harvest.** Nothing on a read path moves: this list is consumed
in-process by the marker-store rebuild, never serialized to a client. The
frozen oracle store contains no `rebuild_media_index` response.

`test/unit/diffusion_graph_native.test.ts` carries the reconciliation directly:
the two tests that pinned the collapse ("TWO REAL tables in ONE database" and
"a LATER real table does replace an EARLIER alias") now assert BOTH real tables,
and the two alias tests ("two aliases and no real table → the first",
"a real table suppresses the aliases of its database") pin the divergence this
entry ledgers.

Operational note: `rebuild_media_index` is idempotent — markers are derived from
the published rows — so an install that lost a table's markers to the old key
recovers with one global-admin rebuild. No migration ships with this change.
