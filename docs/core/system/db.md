# db

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [section_record](../sections/section_record.md) · [SQO](../sqo.md)

The PostgreSQL access layer (`core/db/`) holds the connection manager, the matrix table managers, the JSON record objects and the result wrappers. It is the **only** code in Dédalo's work system that opens a PostgreSQL connection or issues SQL.

## Role

`core/db/` is the bottom layer of the work-system stack. Everything above it —
[`section`](../sections/section.md), [`section_record`](../sections/section_record.md),
components, search — resolves *what* to read or write; `core/db/` is *how* the
bytes actually reach PostgreSQL. There is no PHP class here that `extends`
`common`; this is plain infrastructure (mostly abstract classes and static
managers), not an ontology object.

It sits directly below `section_record`:

```text
section / component        (resolve data; never touch the DB)
        │
section_record             (the per-row I/O object)
        │  delegates every read/save/delete to a static manager
        ▼
core/db/                   ← this subsystem
  ├── DBi                  connection, transactions, schema introspection
  ├── matrix_db_manager    create / read / update / update_by_key / delete / exec_search
  │     └── matrix_activity_db_manager, matrix_activity_diffusion_db_manager, matrix_temp_manager
  ├── tm_db_manager        Time Machine table I/O
  ├── dd_ontology_db_manager   the ontology (matrix_dd) table I/O
  ├── db_result / locators_result   iterable result wrappers
  ├── json_handler / json_streaming_handler   JSON encode/decode helpers
  ├── object_cache         per-request instance caches (section_record / component)
  └── acc/                 JSON_RecordObj_matrix + the legacy RecordObj_* family
        │
PostgreSQL                 matrix tables (typed JSONB columns)
```

!!! note "MariaDB is not here"
    This layer talks **only to PostgreSQL** (`pg_*` functions). The publication /
    diffusion database (MariaDB/MySQL) is owned **exclusively** by the Bun diffusion
    service; **PHP never connects to it** — `DBi` ships no MariaDB connector (the
    former `_getConnection_mysql()` helper was removed). See the
    [architecture overview](../architecture_overview.md#the-two-systems) for the
    work-vs-diffusion split.

## Responsibilities

- **Connection handling** — open, cache, validate and tear down the single
  PostgreSQL connection per request/worker (`DBi`).
- **Transactions** — a depth-aware managed transaction API with SAVEPOINT-based
  nesting and persistent-connection recovery (`DBi`).
- **Matrix record I/O** — the typed CRUD verbs over the `matrix*` tables:
  `create`, `read`, `update`, `update_by_key`, `delete`, plus the prepared-statement
  executors `exec_search` / `exec_sql` (`matrix_db_manager`).
- **Table dispatch** — sibling managers that retarget the same verbs to the
  activity, activity-diffusion and temporary tables.
- **Ontology I/O** — CRUD and term search over the ontology table `matrix_dd`
  (`dd_ontology_db_manager`).
- **Time Machine I/O** — read/write of `matrix_time_machine` snapshots
  (`tm_db_manager`).
- **Result wrapping** — iterable, JSON-decoding result objects
  (`db_result`, `locators_result`).
- **Schema maintenance** — table/column/index/constraint/function introspection
  and the maintenance tasks (`DBi`, `db_tasks`, `db_pg_definitions`,
  `db_analyze_process`).
- **Caching** — per-request LRU instance caches for `section_record` and
  component objects (`object_cache`).
- **Worker hygiene** — the cached connection, the prepared-statement registry and
  the transaction depth are all static; they are explicitly invalidated so state
  cannot bleed across requests in a persistent worker.

## Data model

The physical model is the **matrix** table family described in the
[sections concept page](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns).
Every matrix row is keyed by the composite `(section_tipo, section_id)` and stores
the record payload across **typed JSONB columns** rather than one blob. The
canonical lists live as static arrays on `matrix_db_manager`:

| static array | contents | purpose |
| --- | --- | --- |
| `matrix_db_manager::$tables` | the allow-list of `matrix*` table names (`matrix`, `matrix_hierarchy`, `matrix_users`, `matrix_dd`, `matrix_dataframe`, `matrix_activities`, …) | every verb validates its `$table` against this map — a table not in it is refused. This is the SQL-injection guard for table names. |
| `matrix_db_manager::$columns` | `section_id`, `section_tipo`, `data`, `relation`, `string`, `date`, `iri`, `geo`, `number`, `media`, `misc`, `relation_search`, `meta` | the canonical column set of a matrix row. |
| `matrix_db_manager::$json_columns` | the 11 JSONB columns above (everything except the two id columns) | which columns `db_result` and the read path `json_decode` automatically. |
| `matrix_db_manager::$int_columns` | `id`, `section_id` | which columns are cast to int on the way out. |

Each component model maps to exactly **one** of these columns (the
`section_record_data::$column_map` model→column map; e.g. `component_input_text →
string`, `component_portal → relation`). The db layer itself does not know about
components — it reads and writes columns and JSON keys. The mapping from a
component tipo to its column is done one layer up, in `section_record`.

!!! note "`section_id` is allocated by a counter table"
    `matrix_db_manager::create()` does **not** rely on a serial PK for the logical
    record id. It UPSERTs a per-section counter into `matrix_counter` (or
    `matrix_counter_dd` for `_dd`/ontology tables) inside the same statement and
    uses the returned `value` as the new `section_id`. If the counter is behind the
    table's `MAX(section_id)`, the SQL self-heals by seeding from
    `COALESCE(MAX(section_id),0)+1`. A recursion guard prevents infinite retry.

## Files & structure

```text
core/db/
├── class.DBi.php                              connection + transactions + schema introspection
├── class.matrix_db_manager.php                core matrix CRUD + prepared-statement executors
├── class.matrix_activity_db_manager.php       → matrix_activity (activity log)
├── class.matrix_activity_diffusion_db_manager.php → matrix_activity_diffusion
├── class.matrix_temp_manager.php              → temp table (throwaway rows)
├── class.tm_db_manager.php                    → matrix_time_machine
├── class.dd_ontology_db_manager.php           → matrix_dd (the ontology table)
├── class.db_result.php                        iterable, JSON-decoding result wrapper
├── class.locators_result.php                  same iterable contract over an in-memory locator array
├── class.json_handler.php                     safe json_encode / json_decode / is_json
├── class.json_streaming_handler.php           chunked JSON output for large payloads
├── class.object_cache.php                     section_record_instances_cache + component_instances_cache (LRU)
├── class.db_tasks.php                         DB maintenance (sequences, indexes, constraints, ANALYZE…)
├── db_pg_definitions.php                      the canonical extension/function/index/constraint SQL
├── db_analyze_process.php                     standalone background ANALYZE runner
└── acc/
    ├── class.JSON_RecordObj_matrix.php        v7 matrix record object (cached raw section data source)
    ├── class.JSON_RecordDataBoundObject.php   its abstract base (typed-column properties)
    ├── class.RecordObj_dd.php                  legacy ontology record object
    ├── class.RecordDataBoundObject.php         legacy abstract base
    ├── class.RecordObj_time_machine.php        legacy TM record object
    └── class.search_v6.php                     legacy v6 search engine
```

### How section_record dispatches into this layer

`section_record` keeps a `$data_handler` string — the **class name** of the
manager to use — and calls its verbs statically. The handler is chosen from the
resolved table:

```php
// core/section_record/class.section_record.php (constructor)
$this->data_handler = $this->table === 'matrix_activity'
    ? 'matrix_activity_db_manager'
    : 'matrix_db_manager';
// section_record_temp forces 'matrix_temp_manager'
```

So a normal save is `$this->data_handler::update_by_key($table, $section_tipo,
$section_id, $save_path)` → `matrix_db_manager::update_by_key(...)`. All four
sibling managers share `matrix_db_manager`'s verb signatures, so the dispatch is a
class-name swap, nothing more.

### The `acc/` JSON record objects

`acc/` holds the record-object family. There are two generations:

- **`JSON_RecordObj_matrix`** (extends `JSON_RecordDataBoundObject`) is the **v7**
  object. It is the *raw section-data source* — a per-`(matrix_table, section_id,
  section_tipo)` object that loads a matrix row once and caches it (static
  `$ar_JSON_RecordObj_matrix_instances`, bounded at 1200 with a 400-slice drop, the
  same shape as the `section` instance cache). [`section`](../sections/section.md)
  holds one as its `$JSON_RecordObj_matrix` source, and it carries the
  `Save()` / `save_time_machine()` path used by the section build. The abstract
  base declares the typed-column properties (`data`, `relation`, `string`, `date`,
  `iri`, `geo`, `number`, `media`, `misc`, `relation_search`, plus `counters`) that
  mirror the matrix columns.
- **`RecordObj_dd`, `RecordObj_time_machine`, `RecordDataBoundObject`,
  `search_v6`** are the **legacy** (pre-v7) record/search objects. They are mostly
  superseded by the static managers above. `RecordObj_dd` survives as a thin
  helper for a handful of static lookups (e.g. `RecordObj_dd::get_modelo_name_by_tipo()`),
  but new code should use `dd_ontology_db_manager` / `matrix_db_manager`, not the
  `RecordObj_*` constructors.

!!! warning "Two record-object generations coexist"
    The static managers (`matrix_db_manager` &co.) are the v7 path and own the
    actual CRUD. The `RecordObj_*` classes are legacy; do not reach for them when
    adding new data access. `JSON_RecordObj_matrix` is the exception — it is v7 and
    actively used as the cached raw-data source for a section.

## Public API

Grouped by concern. *static?* marks class-level (static) methods. Names below are
verified against the source; signatures are abbreviated.

### Connection (`DBi`)

| method | static? | purpose |
| --- | --- | --- |
| `_getConnection($host=…, $user=…, $password=…, $database=…, $port=…, $socket=…, $cache=true)` | ✓ | The main connector. Returns a cached `PgSql\Connection` (validated at most every 30 s), or `false`. On a persistent connection it first rolls back any abandoned transaction inherited from the pool. |
| `_getNewConnection(…)` | ✓ | Alias of `_getConnection` with `cache=false` — a fresh, un-cached connection. |
| `_getConnectionPDO(…)` | ✓ | A PostgreSQL PDO connection (used by a few PDO-based paths). |
| `invalidate_connection_cache()` | ✓ | Drop the cached connection **and** the prepared-statement registry (they are bound to the dead connection). Call after a backend may have been killed. |
| `get_connection_string()` | ✓ | Build the `-h/-p/-U` connection string (for CLI tools like `pg_dump`). |

### Transactions (`DBi`)

| method | static? | purpose |
| --- | --- | --- |
| `begin_transaction()` | ✓ | Depth 0 issues a real `BEGIN`; deeper calls (or an externally-open transaction) issue a `SAVEPOINT` so nested code composes. |
| `commit_transaction()` | ✓ | Depth 1 issues `COMMIT` (refused if the transaction is aborted — rolls back instead); deeper levels `RELEASE SAVEPOINT`. |
| `rollback_transaction()` | ✓ | Depth 1 `ROLLBACK`; deeper levels `ROLLBACK TO SAVEPOINT … RELEASE SAVEPOINT`. |
| `transaction(callable $fn)` | ✓ | Run `$fn` inside a managed transaction: commit on success, roll back and rethrow on any `Throwable`. The recommended way to wrap a multi-write unit. |
| `in_transaction()` | ✓ | `true` when a managed transaction is active (depth > 0). |

### Schema introspection & DDL (`DBi`)

| method | static? | purpose |
| --- | --- | --- |
| `check_table_exists($table)` | ✓ | Does the table exist (via `information_schema`). |
| `get_tables(?$conn=null)` | ✓ | All user tables in the `public` schema. |
| `check_column_exists($table, $column)` | ✓ | Does the column exist. |
| `add_column($table, $column, $type='jsonb NULL', $comment='')` | ✓ | `ALTER TABLE … ADD` (no-op if already present); optional `COMMENT ON COLUMN`. |
| `remove_column($table, $column)` | ✓ | `ALTER TABLE … DROP COLUMN` (no-op if absent). |
| `get_indexes()` | ✓ | All non-system indexes (`pg_indexes`). |
| `get_functions()` | ✓ | All user-defined functions (excluding extension-owned). |
| `get_constraint_name_from_index($index_name)` | ✓ | The constraint(s) backed by a given index. |

### Matrix record I/O (`matrix_db_manager`)

| method | static? | purpose |
| --- | --- | --- |
| `create($table, $section_tipo, $values=null)` | ✓ | INSERT a row, allocating `section_id` from the counter table in the same statement. Returns the new `section_id` or `false`. |
| `read($table, $section_tipo, $section_id)` | ✓ | `SELECT * … WHERE section_id=$1 AND section_tipo=$2 LIMIT 1`. Returns the raw row object (columns still JSON strings) or `false`. |
| `update($table, $section_tipo, $section_id, $values)` | ✓ | Replace whole columns. `$values` is `{ column : value }`; a `null` column value clears it. |
| `update_by_key($table, $section_tipo, $section_id, $data_to_save)` | ✓ | Surgical per-key update: each `{column, key, value}` becomes a nested `jsonb_set_lax(...)` on that column; `value === null` deletes the key. This is the call a component save resolves to. |
| `delete($table, $section_tipo, $section_id)` | ✓ | `DELETE … WHERE section_id AND section_tipo`. |
| `search($table, $filter, $order=null, $limit=null)` | ✓ | Simple filtered `section_id` list. **`@DEPRECATED`** — use the SQO search engine. |
| `acquire_node_lock($section_tipo, $section_id)` | ✓ | `pg_advisory_xact_lock(hashtext('tipo_id'))` — a per-record transaction lock. Refused if called outside a transaction (the lock would be released immediately). |
| `exec_search($sql, $params=[], $verbose=false)` | ✓ | The prepared-statement executor used for SELECT/UPDATE/DELETE. Caches statements by `md5($sql)` in `DBi::$prepared_statements`, `DEALLOCATE ALL`s past 1000, logs slow queries and records metrics. Returns a `PgSql\Result` or `false`. |
| `exec_sql($sql, $verbose=false)` | ✓ | One-shot `pg_query` (no params/prepare) — for DDL and ad-hoc SQL. |
| `get_columns_name()` | ✓ | The canonical column list. |

!!! warning "Column names are identifiers, keys are data"
    In `update_by_key()` the **column** is interpolated into the SQL `SET` clause
    (PostgreSQL cannot bind a column name as a parameter), so it is validated
    against `/^[a-zA-Z_][a-zA-Z0-9_]*$/` and rejected otherwise. The JSON **key**
    (the component tipo) is bound as a `text[]` path parameter — it is data, never
    SQL. This is the injection boundary of the write path.

### Sibling table managers

| class | targets | notes |
| --- | --- | --- |
| `matrix_activity_db_manager` | `matrix_activity` | `extends matrix_db_manager`; restricts `$tables` to the activity table. The handler `section_record` picks for activity rows. |
| `matrix_activity_diffusion_db_manager` | `matrix_activity_diffusion` | `extends matrix_db_manager`; the diffusion activity log table. |
| `matrix_temp_manager` | the `temp` table | `extends matrix_db_manager`; `create/read/update/update_by_key/delete` plus `get_uid($section_tipo)`. Backs `section_record_temp` (throwaway rows — no Time Machine, no diffusion). |

### Ontology I/O (`dd_ontology_db_manager`)

The ontology lives in its own matrix table (`matrix_dd`), keyed by `tipo` rather
than `(section_tipo, section_id)`. `dd_ontology_db_manager` (`abstract`) is the
ontology counterpart of `matrix_db_manager`.

| method | static? | purpose |
| --- | --- | --- |
| `create($tipo, $values=null)` | ✓ | INSERT an ontology node, returns the new `id` or `false`. |
| `read($tipo)` | ✓ | Read a node's columns by `tipo`. |
| `update($tipo, $values)` | ✓ | Update node columns. |
| `delete($tipo)` | ✓ | Delete a node. |
| `search($values, $order=false, $limit=null)` | ✓ | Filtered node search. |
| `search_exact_term(…)` | ✓ | Exact term-text lookup. |
| `search_fuzzy_term(…)` | ✓ | Fuzzy/accent-insensitive term lookup. |

### Time Machine I/O (`tm_db_manager`)

| method | static? | purpose |
| --- | --- | --- |
| `create($values=null)` | ✓ | INSERT a `matrix_time_machine` snapshot, returns the new id. |
| `read($id)` | ✓ | Read a snapshot by id. |
| `update($id, $values)` | ✓ | Update a snapshot. |
| `delete($id)` | ✓ | Delete a snapshot. |

(`$table` is fixed to `matrix_time_machine`.) Note that `section_record::read()`
special-cases the TM table — its data is injected by `tm_record`, not read through
this manager.

### Result wrappers

| class | method(s) | purpose |
| --- | --- | --- |
| `db_result` | `getIterator()`, `fetch_all()`, `fetch_one()`, `row_count()`, `affected_rows()`, `map_iterator($cb)`, `seek($n)`, `free()`, `get_result()` | Wrap a `PgSql\Result` as an iterable; rows are yielded as objects (or arrays with `$as_array`) and the JSON columns are `json_decode`d on the fly. Frees the result on destruct. `seek()` enables the two-pass column-discovery + streaming used by `tool_export`. |
| `locators_result` | same iterable contract | The same interface over an in-memory locator array, so callers can treat a `PgSql\Result` and a pre-built locator list interchangeably. |

### JSON helpers

| method | static? | purpose |
| --- | --- | --- |
| `json_handler::encode($value, $options=JSON_UNESCAPED_UNICODE)` | ✓ | Safe `json_encode` (consistent flags, error handling). |
| `json_handler::decode($json, $assoc=false)` | ✓ | Safe `json_decode`. |
| `json_handler::is_json($value)` | ✓ | Whether a value is a valid JSON string. |
| `json_streaming_handler::stream($value, $options=0, $chunk_size=1000)` | ✓ | Echo a value as JSON directly to the output buffer, chunking large arrays/objects to keep memory flat. |

### Caches (`object_cache`)

This file declares two LRU instance caches (not connection/data caches):

| class | caches | key API |
| --- | --- | --- |
| `section_record_instances_cache` | `section_record` instances | `get($key)`, `set($key, $obj)`, `delete($key)`, `configure(maxSize:…)`, `getStats()`, `getAnalytics()`, `clear()` (composite keys supported). LRU eviction; warns below ~70% hit rate. |
| `component_instances_cache` | component instances | the same shape. |

### Maintenance (`db_tasks`)

| method | static? | purpose |
| --- | --- | --- |
| `check_sequences()` | ✓ | Verify/fix PostgreSQL sequences against table contents. |
| `optimize_tables($tables)` / `consolidate_table($table)` | ✓ | VACUUM/optimize / consolidate. |
| `exec_maintenance()` | ✓ | Run the maintenance batch. |
| `create_extensions()` / `rebuild_functions()` / `rebuild_indexes($tables=[])` / `rebuild_constraints()` | ✓ | (Re)apply the SQL from `db_pg_definitions.php`. |
| `get_tables()` / `get_table_indexes($table)` | ✓ | Maintenance-oriented table/index listings. |
| `analyze_db()` / `should_run_analyze()` / `get_analyze_cache_file_name()` | ✓ | Drive the background `ANALYZE` (executed standalone by `db_analyze_process.php`). |

`db_pg_definitions.php` returns the canonical arrays (`ar_extensions`,
`ar_function`, `ar_constraint`, `ar_index`, `ar_maintenance`); each entry has
`add` / `drop` (and optional `sample`) SQL. `db_tasks` consumes them so the schema
extras are declared in one place.

## How it fits with the rest of Dédalo

- **`section_record` is the only caller of the matrix managers.** Per the
  contract in [section_record](../sections/section_record.md), a component reads via
  `section_record::get_component_data()` and writes via
  `save_component_data()`; those resolve to `matrix_db_manager::read()` /
  `update_by_key()`. Components and [`section`](../sections/section.md) never call
  `pg_*` or a db manager directly. The one exception in this layer is the section's
  cached raw-data source, `JSON_RecordObj_matrix`.
- **Search compiles down to `exec_search`.** The [SQO](../sqo.md) search engine
  builds prepared SQL over the JSONB matrix columns and runs it through
  `matrix_db_manager::exec_search()` (the prepared-statement cache and slow-query
  metrics live here). See the [search subsystem](../sqo.md).
- **The ontology is itself matrix data.** The active schema (areas, sections,
  components, tools) is stored in `matrix_dd` and read/written through
  `dd_ontology_db_manager`. See the [architecture overview](../architecture_overview.md#the-ontology-is-the-active-schema).
- **Time Machine** snapshots flow through `tm_db_manager`; deletes and restores in
  `section_record` coordinate with it.
- **Diffusion is out of scope.** Publication data goes to MariaDB via the Bun
  diffusion service, not through this layer. See the
  [architecture overview](../architecture_overview.md#the-two-systems).

## Examples

### Run a unit of work in a managed transaction

```php
// Commits on success; rolls back and rethrows on any Throwable.
$new_id = DBi::transaction(function() use ($section_tipo, $values) {
    $id = matrix_db_manager::create('matrix', $section_tipo, $values);
    if ($id === false) {
        throw new RuntimeException('create failed');
    }
    return $id;
});
```

### Lock a record before mutating it (must be inside a transaction)

```php
DBi::transaction(function() use ($section_tipo, $section_id) {
    // serialize concurrent writers on this exact record
    matrix_db_manager::acquire_node_lock($section_tipo, $section_id);

    // ... read-modify-write the row safely ...
    matrix_db_manager::update_by_key('matrix', $section_tipo, $section_id, [
        (object)[ 'column' => 'string', 'key' => 'oh25', 'value' => ['Hello'] ]
    ]);
});
```

### A surgical per-key write (what a component save becomes)

```php
// set string.oh25 = ['Hello'] and clear meta.oh25 in one UPDATE
$ok = matrix_db_manager::update_by_key('matrix', 'oh1', 5, [
    (object)[ 'column' => 'string', 'key' => 'oh25', 'value' => ['Hello'] ],
    (object)[ 'column' => 'meta',   'key' => 'oh25', 'value' => null ] // null deletes the key
]);
```

### Iterate a query result with automatic JSON decoding

```php
$result = matrix_db_manager::exec_search(
    'SELECT section_id, "string" FROM matrix WHERE section_tipo = $1',
    ['oh1']
);
if ($result !== false) {
    foreach (new db_result($result) as $row) {
        // $row->string is already json_decode()d (it is in $json_columns)
        // $row->section_id is an int (it is in $int_columns)
    }
}
```

!!! note "Prefer the high-level path"
    The examples above touch the managers directly to document the surface. In
    application code you almost always go through `section_record` /
    [`section`](../sections/section.md) and the [SQO](../sqo.md) engine — those add
    the metadata, Time Machine, permission and relation handling that the raw
    managers deliberately do not.

## Related

- [section_record](../sections/section_record.md) — the per-row I/O object; the only caller of the matrix managers.
- [section](../sections/section.md) — the section type/orchestrator; holds the cached `JSON_RecordObj_matrix` raw-data source.
- [Sections concept](../sections/index.md) — the matrix table model and the typed-JSONB column split.
- [Architecture overview](../architecture_overview.md) — the work-vs-diffusion split, the matrix data model, the request lifecycle.
- [SQO](../sqo.md) — the search query object compiled into prepared SQL over the matrix columns via `exec_search`.
- [Locator](../locator.md) — the pointer type stored in the `relation` column.
