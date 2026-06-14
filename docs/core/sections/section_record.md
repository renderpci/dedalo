# section_record

> The per-record physical database I/O object: one row of the `matrix` table in PHP space, and the **only** code that reads from or writes to it.

## Role

A logical record is the pair **`(section_tipo, section_id)`**. Its payload lives
in one row of the `matrix` table, physically split across typed JSONB columns
(`data`, `string`, `number`, `relation`, `date`, `iri`, `geo`, `media`, `misc`,
`relation_search`, `meta`). The storage model — which column holds what, and the
model→column map — is described in [the sections concept page](index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns).
This page is the **class reference**: it documents the I/O API, not the storage
layout.

`section_record` is the runtime representation of *one row*. It owns the database
verbs — `read()`, `save()`, `save_column()`, `save_key_data()`,
`save_component_data()`, `delete()`, `duplicate()`, `create()` — and delegates the
in-memory column store to a [`section_record_data`](#section_record_data) instance.

Position it among its siblings:

| class | scope | role |
| --- | --- | --- |
| [`section`](section.md) | the *type* | Table-with-logic: instancing, record create/duplicate/delete orchestration, the shared `relations` API, permissions. |
| [`sections`](sections.md) | many records | Multi-record loader: resolves a set of locators or an SQO into many records (list views, portals). |
| **`section_record`** | one *row* | Physical DB I/O for a single record: read / save / delete / duplicate, metadata, counters. |
| `section_record_data` | one *row's columns* | In-memory typed-column container with lazy JSON decode. Not a DB object. |
| `section_record_temp` | one *temp row* | `section_record` subclass that targets the `temp` table. |

!!! note "Components never touch the database"
    A component resolves its value through `section_record::get_component_data()`
    and persists it through `section_record::save_component_data()`. The component
    knows its data shape; `section_record` knows where (which typed column) and how
    it is stored. The parent [`section`](section.md) calls into `section_record`
    for the record-level relations bag and the created/modified metadata. This is
    the meaning of *"sections own database access; components read and save
    through them."*

---

## The three classes

### `section_record`

`core/section_record/class.section_record.php` — the physical record I/O object.
Holds `section_tipo`, `section_id`, a `section_record_data` instance
(`$data_instance`), the resolved `$table`, and the `$data_handler` to use
(`matrix_db_manager` by default; `matrix_activity_db_manager` when the table is
`matrix_activity`). All database operations go through the static methods of the
data handler (`::read`, `::update`, `::update_by_key`, `::create`, `::delete`).

### `section_record_data`

`core/section_record/class.section_record_data.php` — the **typed-column data
container**. It is *not* a database object; it just holds the decoded (or
pending-decode) value of each column for one record.

- **`$columns_name`** — the canonical column list (see below), declared once here.
- **`$column_map`** (`public static`) — the model→column map. A component model
  resolves to exactly one column, e.g. `component_input_text → string`,
  `component_portal → relation`, `component_date → date`, `component_image →
  media`. `section → data`. The legacy single column was `datos`. Resolve it with
  the static helper `section_record_data::get_column_name( $model )`.
- **Lazy decode.** Raw JSON strings from the DB are stored undecoded in
  `$raw_data` with a per-column `$decoded` flag. The first access to a column
  calls the private `ensure_decoded()`, which `json_decode`s it (throwing on a
  decode error) and flips the flag. `null` values are considered already decoded.
  This keeps list mode cheap — columns nobody reads are never parsed.
- **Accessors:** `get_data()` (materializes every column), `get_column_data($column)`,
  `get_key_data($column, $key)`; `set_data($object)`, `set_column_data($column, $value)`
  (a string is stored raw for lazy decode; an object/null is stored decoded),
  `set_key_data($column, $key, $data)` (`$data === null` removes the key).

```php
section_record_data::$columns_name
// [ 'data', 'relation', 'string', 'date', 'iri', 'geo',
//   'number', 'media', 'misc', 'relation_search', 'meta' ]
```

!!! note "`section_id` is a virtual column"
    `$column_map` maps `component_section_id → section_id`, but `section_id` is
    **not** in `$columns_name` — it is the row's own primary-lookup key, not a
    JSONB column. `component_section_id` is therefore a read-only, virtual
    component with no stored value.

### `section_record_temp`

`core/section_record/class.section_record_temp.php` — a thin subclass
(`extends section_record`) that targets the temporary table. It is instanced via
`section_record::get_instance(..., $is_temporal = true)`, and the cache key carries
a `_temp` suffix. What it overrides:

| method | override |
| --- | --- |
| `__construct()` | Calls the parent, then forces `$this->data_handler = 'matrix_temp_manager'`. |
| `get_table()` | Returns the literal string `'temp'` (the parent returns the resolved `matrix*` table). |
| `get_component_data()` | Loads once then reads the key from the temp handler (same shape as the parent). |
| `save()` | `matrix_temp_manager::update($table, $section_tipo, $section_id, $data)`. |
| `delete()` | `matrix_temp_manager::delete(...)`, then clears the loaded flag and evicts the `_temp` cache key. No Time Machine, no inverse-reference cleanup, no diffusion — temp rows are throwaway. |

---

## Instantiation & lifecycle

### get_instance

```php
public static function get_instance(
    string     $section_tipo,
    int|string $section_id,        // string is DEPRECATED, cast to int with a warning
    bool       $is_temporal = false
) : section_record
```

Returns a cached instance from `section_record_instances_cache` keyed by
`"{section_tipo}_{section_id}"` (plus `_temp` when `$is_temporal`). On a miss it
constructs a `section_record` (or `section_record_temp`) and stores it. **All
callers asking for the same `(section_tipo, section_id)` share one instance**, so
the `section_record_data` columns are read from the DB at most once per record per
request, regardless of mode.

The constructor (`protected`) sets the ids, creates the `section_record_data`
instance, resolves the table via `common::get_matrix_table_from_tipo()` (falling
back to `'invalid_table'`), and selects the data handler.

### create

```php
public static function create(
    string  $section_tipo,
    ?int    $section_id = null,    // null = INSERT a new row; non-null = UPDATE
    ?object $values     = null     // { column : { tipo : data } }  (column 'data' is the section metadata object)
) : section_record|false
```

The insert/update entry point. Under `SHOW_DEBUG` it asserts that **only the
`section` class may call it** (it inspects the backtrace and throws otherwise) —
this is how the create flow stays funneled through [`section`](section.md). When
`$section_id` is `null` it INSERTs through the data handler's `::create` and
returns the new instance; when an id is given it merges the *modified* metadata
into `$values`, sets each column/component, and `save()`s in one transaction.

### read

```php
public function read( bool $cache = true ) : ?object
```

Queries the row once via `$data_handler::read(...)`, passing each non-null column
to `set_column_data()` as a raw string for lazy decode, and sets
`$is_loaded_data = true`. A miss is cached as `record_in_the_database = false` so
repeated lookups in the same request don't re-query. The
`matrix_time_machine` table is special-cased (its data is injected by `tm_record`,
not read here). `protected load_data()` wraps `read()` and maintains
`record_in_the_database`.

### exists_in_the_database

```php
public function exists_in_the_database() : bool
```

Returns the cached `record_in_the_database` flag, forcing a `load_data()` the
first time.

### __destruct

Evicts the instance from `section_record_instances_cache` (the
`"{section_tipo}_{section_id}"` key) and unsets `$data_instance`, so per-request
state does not bleed across requests in a persistent worker. `section_record_data`
similarly evicts itself on destruct.

```php
$section_record = section_record::get_instance( 'oh1', 5 );

if ( $section_record->exists_in_the_database() ) {
    $data = $section_record->get_data(); // full typed-column object
}
```

---

## Reading data

| method | returns | reads |
| --- | --- | --- |
| `get_data()` | `object` | All typed columns, fully materialized (every lazy column decoded). |
| `get_component_data( $tipo, $column )` | `array\|null` | One component's stored value — every language, exactly as stored — from its column. This is the call components use to read. |
| `get_inverse_references()` | `array` | The locators of other records that point *at* this one (via `search_related::get_referenced_locators`). |

The value path is: `get_component_data($tipo, $column)` →
`section_record_data::get_key_data($column, $tipo)` → `ensure_decoded($column)` →
the slice of the typed column keyed by the component tipo. The caller already
knows its column from the model via `section_record_data::get_column_name($model)`.

```php
// a component_input_text (model maps to the 'string' column)
$column = section_record_data::get_column_name('component_input_text'); // 'string'
$value  = $section_record->get_component_data( 'oh25', $column );        // array|null
```

---

## Writing data

There are four granularities of write, from whole-row down to a single key, plus
the component entry point.

| method | writes | DB op |
| --- | --- | --- |
| `set_data($object)` / `save()` | Stage all columns in memory, then flush every column in one `update`. A column set to `null` is deleted by the DB. | `$data_handler::update` |
| `set_column_data($column, $object)` / `save_column($column, $value)` | One whole typed column (a section data object, or all components sharing a data type). | `$data_handler::update` |
| `set_component_data($tipo, $column, $data)` / `save_key_data($save_path)` | One component's key inside a column. `save_key_data()` also **deletes a column that became empty** to keep the row clean. | `$data_handler::update_by_key` |
| **`save_component_data($save_path)`** | THE entry point components use to persist their value. | `update_by_key` |

`save_component_data()` is what a component calls after it has staged its value
with `set_component_data()`. It merges the component's `$save_path` with the
record's *modified* metadata (`modified_by_user`, `modified_date`, computed by
`get_modified_section_save_path('update_record')`), then does a single
`save_key_data()` so the component value and the metadata land in one DB update,
and fires `save_event()`.

A `$save_path` is an array of `{column, key}` objects — one per column the
component touches (a string component touches `string` and `meta`):

```php
$save_path = [
    (object)[ 'column' => 'string', 'key' => 'oh25' ],
    (object)[ 'column' => 'meta',   'key' => 'oh25' ]
];

$section_record->set_component_data( 'oh25', 'string', $value_array );
$section_record->save_component_data( $save_path );
```

A component routes its value to the correct column because its **model** resolves
to one column via `section_record_data::$column_map` — the `key` is always the
component tipo, the `column` is the mapped column.

### Delete family

| method | effect |
| --- | --- |
| `delete( $delete_diffusion_records = true )` | Full record delete. (1) creates a Time Machine snapshot and verifies the saved copy equals the live data — refusing to proceed otherwise; (2) deletes the row; (3) removes inverse references and moves media files to the deleted folder; (4) propagates the delete to diffusion targets (failures are logged, never block); (5) clears the instance and evicts the cache; logs a `DELETE` activity. Refuses `section_id < 1`. |
| `delete_data()` | Empties every component child's data in place (skipping `component_section_id`, `component_external`, `component_inverse`; resetting `component_filter` to the user's default project), moves media to the deleted folder, updates the modified metadata, logs a `DELETE` activity. The row itself survives. |
| `delete_column()` | Empty stub — reserved, currently a no-op. |

### duplicate

```php
public function duplicate() : int|false
```

Clones the full data into a brand-new `section_id` (via
`section::create_record()`), then re-`save()`s every component so each one
rebuilds its own state — regenerating media files for the new id and creating
Time Machine / activity entries. Columns `data`, `meta`, `relation_search` and the
section-info tipos are skipped on copy; media components duplicate their files
from the source. Returns the new `section_id` or `false`.

---

## Component value ids & counters

String-type component values carry a per-value unique id (the dataframe pairing
`id_key`). The next id is tracked by a per-component counter stored in the `meta`
column under the component tipo, as `[ { "count": N } ]`.

| method | purpose |
| --- | --- |
| `get_component_counter( $tipo ) : int` | Current counter (0 when absent). |
| `set_component_counter( $tipo, $value ) : int` | Write the counter into the `meta` column. |
| `allocate_component_ids( $tipo, $count = 1 ) : array` | **Atomically** allocate `$count` fresh ids, e.g. `[8,9,10]`. Serialized with a PostgreSQL session-level advisory lock keyed on `(table, record, component)`; re-reads the *persisted* counter (concurrent processes may have advanced it), persists the new counter immediately with `jsonb_set`, and syncs the in-memory counter. Falls back to a non-atomic in-memory bump if the DB connection is unavailable. |
| `raise_component_counter( $tipo, $min_value ) : int` | Raise the counter to at least `$min_value` (no-op if already there) under the same lock — used to absorb explicit ids carried by imported/migrated data without racing live allocations. |

!!! warning "Item ids are never reused"
    Item ids must be unique per component per record and never recycled, so a
    plain read-increment-write of the in-memory counter is unsafe across
    concurrent processes editing the same record. Use `allocate_component_ids()`
    / `raise_component_counter()`, which lock and persist atomically.

---

## Metadata

Records carry created/modified by-user and date, stored as fixed private tipos
(resolved through `section::get_metadata_definition()`):

| concept | tipo | column |
| --- | --- | --- |
| created by user | `dd200` | `relation` |
| created date | `dd199` | `date` |
| modified by user | `dd197` | `relation` |
| modified date | `dd201` | `date` |

| method | purpose |
| --- | --- |
| `build_metadata( $tipo, $section_id, $user_id ) : object` *(static)* | Builds the initial `data`-column section metadata (label, created timestamp, section ids, `diffusion_info`, `created_by_user_id`) for a brand-new record. |
| `build_modification_data( $section_tipo, $mode, $user_id ) : object` *(static, pure)* | Returns the created/modified user-locator + date keyed by column and tipo. `$mode` is `'new_record'` or `'update_record'`. Returns `{}` for the Activity section or when `$user_id` is empty. No DB side effect. |
| `get_modified_section_save_path( $mode ) : array` *(private)* | Calls `build_modification_data`, sets the values into `data_instance`, and returns the `{column, key}` save_path. This is what `save_component_data()` merges in. |
| `update_modified_section_data( $options ) : bool` | Computes the metadata path (`$options->mode`) and `save_key_data()`s it, then fires `save_event()`. |
| `get_created_date()` / `get_modified_date()` | Localized timestamp string (or `null`). |
| `set_created_date($ts)` / `set_modified_date($ts)` | Write a date into the `date` column (used mainly by imports). |
| `get_created_by_user_id()` / `get_modified_by_user_id()` | The user `section_id` from the `relation` column (or `null`). |
| `set_created_by_user_id($id)` / `set_modified_by_user_id($id)` | Write a user locator into the `relation` column. |
| `get_created_by_user_name($full=false)` / `get_modified_by_user_name($full=false)` | Resolve the user name via `get_user_name_by_user_id`. |
| `get_user_name_by_user_id( $userID, $full_name = true ) : ?string` *(static)* | The user (full) name; `root` / `Admin debugger` for the superuser. |

`save_event()` (protected) is fired after every persist and invalidates the
file/static caches of special sections (request-config presets `dd1244`, tools
register `dd1324`, tools configuration `dd996`, profiles `dd234`).

---

## Permissions, table, json

| method | purpose |
| --- | --- |
| `get_permissions() : int` | Per-record permission via `common::get_permissions($tipo, $tipo)`, cached on the instance. Special cases: the Users section grants `1` over your own user row (for `tool_user_admin`); Time Machine notes (`rsc832`) grant `2` to the note's creator or a global admin, `1` otherwise. |
| `get_table() : string` | The resolved `matrix*` table (`section_record_temp` overrides this to `'temp'`). |
| `jsonSerialize() : mixed` | `JsonSerializable` hook — returns the object's non-null vars (keeps the serialized payload small). *(There is no separate `json()` method; this is the serialization surface.)* |
| `restore_deleted_section_media_files() : ?array` | Used when recovering a record from Time Machine: moves each media component's files back from the deleted folder. |
| `remove_all_inverse_references() : array` | On delete, removes every locator that other records hold pointing at this one. Only relation-family components and `component_dataframe` are processed (dataframe pairing is dual-read: `id_key` unified contract or legacy `section_id_key`). |
| `remove_section_media_files() : ?array` *(protected)* | On delete, moves all of this record's media files (all qualities) to the deleted folder. |

---

## Public API

| method | class | static? | purpose |
| --- | --- | --- | --- |
| `get_instance($section_tipo, $section_id, $is_temporal=false)` | `section_record` | yes | Cached per-record instance. |
| `create($section_tipo, $section_id=null, $values=null)` | `section_record` | yes | Insert (id null) or update a row. Section-only caller. |
| `read($cache=true)` | `section_record` | no | Query the row once; lazy-decode columns. |
| `exists_in_the_database()` | `section_record` | no | Whether the row exists. |
| `get_data()` | `section_record` | no | Full typed-column object. |
| `set_data($object)` | `section_record` | no | Stage all columns in memory. |
| `get_component_data($tipo, $column)` | `section_record` | no | Read one component's value. |
| `set_component_data($tipo, $column, $data)` | `section_record` | no | Stage one component's value. |
| `set_column_data($column, $object)` | `section_record` | no | Stage one whole column. |
| `save()` | `section_record` | no | Flush every column in one update. |
| `save_column($column, $value)` | `section_record` | no | Persist one whole column. |
| `save_key_data($save_path)` | `section_record` | no | Persist listed `{column,key}` items; drop empty columns. |
| `save_component_data($save_path)` | `section_record` | no | **Component persist entry point** (value + modified metadata in one update). |
| `delete($delete_diffusion_records=true)` | `section_record` | no | Full record delete (TM snapshot, inverse refs, media, diffusion). |
| `delete_data()` | `section_record` | no | Empty all component data, keep the row. |
| `delete_column()` | `section_record` | no | Reserved stub (no-op). |
| `duplicate()` | `section_record` | no | Clone into a new `section_id`. |
| `get_component_counter($tipo)` | `section_record` | no | Read per-component value-id counter. |
| `set_component_counter($tipo, $value)` | `section_record` | no | Write the counter (`meta` column). |
| `allocate_component_ids($tipo, $count=1)` | `section_record` | no | Atomically allocate value ids. |
| `raise_component_counter($tipo, $min_value)` | `section_record` | no | Atomically raise the counter. |
| `build_metadata($tipo, $section_id, $user_id)` | `section_record` | yes | Initial section metadata for a new record. |
| `build_modification_data($section_tipo, $mode, $user_id)` | `section_record` | yes | Created/modified locator + date values. |
| `update_modified_section_data($options)` | `section_record` | no | Persist modified metadata. |
| `get_created_date()` / `get_modified_date()` | `section_record` | no | Localized date string. |
| `set_created_date($ts)` / `set_modified_date($ts)` | `section_record` | no | Write date (imports). |
| `get_created_by_user_id()` / `get_modified_by_user_id()` | `section_record` | no | User section_id. |
| `set_created_by_user_id($id)` / `set_modified_by_user_id($id)` | `section_record` | no | Write user locator. |
| `get_created_by_user_name($full=false)` / `get_modified_by_user_name($full=false)` | `section_record` | no | User name. |
| `get_user_name_by_user_id($userID, $full_name=true)` | `section_record` | yes | Resolve a user name. |
| `get_inverse_references()` | `section_record` | no | Locators pointing at this record. |
| `remove_all_inverse_references()` | `section_record` | no | Strip inverse references (on delete). |
| `restore_deleted_section_media_files()` | `section_record` | no | Restore media from the deleted folder. |
| `get_permissions()` | `section_record` | no | Per-record permission int. |
| `get_table()` | `section_record` | no | Resolved table name. |
| `jsonSerialize()` | `section_record` | no | JSON serialization hook. |
| `get_instance($section_tipo, $section_id)` | `section_record_data` | yes | New typed-column container. |
| `get_columns_name()` | `section_record_data` | no | The canonical column list. |
| `get_column_name($model)` | `section_record_data` | yes | Model → column (via `$column_map`). |
| `get_data()` | `section_record_data` | no | All columns, materialized. |
| `get_column_data($column)` | `section_record_data` | no | One column (lazy-decoded). |
| `get_key_data($column, $key)` | `section_record_data` | no | One key within a column. |
| `set_data($object)` | `section_record_data` | no | Replace all columns. |
| `set_column_data($column, $value)` | `section_record_data` | no | Set one column (string=raw/lazy, object=decoded). |
| `set_key_data($column, $key, $data)` | `section_record_data` | no | Set/remove one key. |
| `get_table()` *(override → `'temp'`)* | `section_record_temp` | no | Temp table name. |
| `get_component_data($tipo, $column)` *(override)* | `section_record_temp` | no | Read from the temp handler. |
| `save()` *(override)* | `section_record_temp` | no | Persist to the temp table. |
| `delete($delete_diffusion_records=true)` *(override)* | `section_record_temp` | no | Delete the temp row (no TM/diffusion). |

---

## Examples

### Instantiate and read a component's value

```php
$section_record = section_record::get_instance( 'oh1', 5 );

if ( $section_record->exists_in_the_database() ) {
    // resolve the column for a string component, then read its stored value
    $column = section_record_data::get_column_name('component_input_text'); // 'string'
    $value  = $section_record->get_component_data( 'oh25', $column );        // array|null
}
```

### Save a component's value via save_component_data

```php
$section_record = section_record::get_instance( 'oh1', 5 );

// stage the value into its mapped column (the key is the component tipo)
$section_record->set_component_data( 'oh25', 'string', [ 'Hello world' ] );
$section_record->set_component_data( 'oh25', 'meta',   [ (object)['count' => 1] ] );

// persist value + modified metadata in a single DB update
$ok = $section_record->save_component_data([
    (object)[ 'column' => 'string', 'key' => 'oh25' ],
    (object)[ 'column' => 'meta',   'key' => 'oh25' ]
]);
```

### Duplicate a record

```php
$section_record = section_record::get_instance( 'oh1', 5 );

$new_section_id = $section_record->duplicate(); // int|false
// every component re-saves: media files regenerated, Time Machine entries created
```

### Delete a record

```php
$section_record = section_record::get_instance( 'oh1', 5 );

// (1) Time Machine snapshot + verify, (2) delete row,
// (3) strip inverse refs + move media, (4) diffusion unpublish, (5) evict cache
$deleted = $section_record->delete(); // bool — refuses section_id < 1
```

---

## Related

- [Sections concept](index.md) — the matrix-table model and the typed-column split.
- [section](section.md) — the section *type*: instancing, create/duplicate/delete orchestration, relations API, permissions.
- [sections](sections.md) — the multi-record loader.
- [Components](../components/index.md) — the fields that read and save through `section_record`.
- [Locator](../locator.md) — the pointer stored in the `relation` column and inverse references.
