# sections

The plural **collection helper** for one or more section types: given a search
query (or a set of locators), it resolves the matching records of a
`section_tipo`, enumerates their `section_id`s, and performs bulk deletes. It is
the object that answers *"which records of this section exist?"* — not the one
that reads or writes a single record.

> See also: [Sections concept](index.md) · [section](section.md) · [section_record](section_record.md) · [Components](../components/index.md)

## Role

`sections extends common`. Where the [section concept doc](index.md) explains
the matrix-table model — a logical record is the pair
`(section_tipo, section_id)`, and all records of every section live in one
`matrix` table — `sections` operates over the **collection** of records that
share a `section_tipo`. It does not own a record's data or its database I/O; it
runs a search and hands back the result.

Three sibling classes share the "section" name and are easy to confuse. Keep the
distinction crisp:

| class | scope | owns | typical job |
| --- | --- | --- | --- |
| **`section`** (singular) | one section *type* (one `section_tipo`) | the table abstraction: components, permissions, the shared `relations` array, record create/duplicate orchestration | instance a section type, build its JSON, create a record |
| **`section_record`** | one record *row* `(section_tipo, section_id)` | the physical per-record DB I/O (`read` / `save` / `delete` / `duplicate`) | load, persist or delete a single row in `matrix` |
| **`sections`** (plural — *this class*) | the *collection* of records of a `section_tipo` | nothing persistent; it runs a search over the matrix | list the `section_id`s, fetch list data, bulk-delete records matching a query |

In short: `section` is the type, `section_record` is one row, and `sections` is
"the set of rows". `sections` never touches a column directly — it delegates
reads to the [search / SQO](../sqo.md) machinery and per-record deletes to `section_record`.

## Instantiation

`sections` is constructed through its static factory. The constructor is
`private`, so always go through `get_instance()`. There is **no instance cache**
— each call returns a fresh object (the search result it later computes is
memoized on that instance).

```php
public static function sections::get_instance(
    array|null  $ar_locators        = null,                 // locators identifying specific records to scope (section_tipo + section_id)
    object|null $search_query_object = null,                // the SQO (search query object) that defines filter / order / pagination
    string|null $caller_tipo        = null,                 // tipo of the caller — normally a section or component_portal
    string      $mode               = 'list',               // working mode (list | edit | tm | related | …)
    string      $lang               = DEDALO_DATA_NOLAN      // language to load
): object
```

The constructor clones the received `search_query_object` (so the caller's SQO
is never mutated) and runs `set_up()`, which only acts when an SQO is present:
it fills a default `limit` (1 in `edit` mode; otherwise the caller section's
configured limit, falling back to `10`), defaults `offset` to `0`, and forces
`select = []` so the query returns just `(section_tipo, section_id)` and avoids
loading unused data.

```php
// scope the collection with a search query object (SQO)
$sqo = new search_query_object();
    $sqo->set_section_tipo([ 'oh1' ]); // Oral History interviews

$sections = sections::get_instance(
    null,   // ?array  $ar_locators
    $sqo,   // object  $search_query_object
    'oh1',  // string  $caller_tipo (the section asking)
    'list', // string  $mode
    DEDALO_DATA_NOLAN
);
```

## Public API

| method | static? | purpose / returns |
| --- | --- | --- |
| `get_instance($ar_locators, $search_query_object, $caller_tipo, $mode, $lang)` | yes | Factory. Returns a fresh `sections` instance (the constructor is private). |
| `get_data()` | no | Runs the SQO through `search::get_instance(...)->search()` and returns the raw **`db_result`** of matching records (each row carries `section_tipo` + `section_id`). The result is memoized on the instance; returns **`false`** if the underlying search errors. |
| `get_ar_all_section_id()` | no | Returns a plain **`array` of int `section_id`s** for *every* record matching the SQO. It re-runs the search with `limit = 0`, `offset = 0`, `full_count = false`, `select = []`, `parsed = true` — i.e. it deliberately ignores pagination to enumerate the whole set. Returns `[]` when there is no SQO. |
| `get_ar_section_tipo()` | no | Returns the **`array` of `section_tipo`s** in scope (alias for "the section types this query covers"). For an ordinary query it is the SQO's `section_tipo`; for a `related`-mode query whose `section_tipo` is `'all'` it forces a data load and derives the distinct tipos from the returned rows. Memoized. |
| `delete($options)` | no | Bulk-deletes the records matching `$options->sqo` (or a self-built SQO from `section_tipo` + `section_id`). Returns a `stdClass` **`$response`** with `result` (array of deleted `section_id`s, or `false`/`[]` on failure), `msg`, `errors`, and `delete_mode`. |

### About `delete($options)`

`delete()` is the bulk-delete entry point used by the API. Its `$options`
object accepts:

```json
{
    "delete_mode"              : "delete_data | delete_record",
    "section_tipo"             : "oh1",
    "section_id"               : 57,
    "sqo"                      : { "section_tipo": ["oh1"], "filter_by_locators": [ { "section_tipo": "oh1", "section_id": "127" } ], "limit": 1 },
    "delete_diffusion_records" : true,
    "delete_with_children"     : false,
    "prevent_delete_main"      : false
}
```

Notable guarantees enforced inside `delete()`:

- **Permissions:** it instances the target `section` and requires
  `get_section_permissions() >= 2`; otherwise it refuses and returns the error
  response.
- **Multiple-delete guard:** if the search matches more than one record, only a
  global admin (`security::is_global_admin`) may proceed.
- **`delete_mode`** chooses the per-record operation: `delete_record` calls
  `section_record::delete()` (full record removal, Time-Machine-backed),
  `delete_data` calls `section_record::delete_data()` (clears data only).
- **Children guard (thesaurus):** in `delete_record` mode with
  `delete_with_children = false`, records that still have
  `component_relation_children` are skipped (and reported in `errors`).
- **Ontology coherence:** deleting a record whose `section_tipo` ends in `0`
  (an ontology section such as `numisdata0`) also deletes the matching
  `dd_ontology` node; `DEDALO_HIERARCHY_SECTION_TIPO` /
  `DEDALO_ONTOLOGY_SECTION_TIPO` records go through `ontology::delete_main()`
  unless `prevent_delete_main` is set.
- **Verification:** after a `delete_record` pass it re-runs the search and fails
  the response if any matched record still exists.

## When it is used

Reach for `sections` (plural) when you are working with **the set of records of
a section_tipo**, not a single one:

- **List mode / search results.** Building a section's list view: the API
  (`dd_core_api`) instances `sections` with the navigation SQO and calls
  `get_data()`; `sections_json.php` turns that `db_result` into the
  context/data the client renders (one `section` instance per `section_tipo`,
  many `section_record`s attached to it).
- **Enumerating / iterating every record.** When you need *all* `section_id`s
  matching a query (e.g. to loop and process each), use
  `get_ar_all_section_id()` — it bypasses pagination on purpose.
- **Resolving inverse / related references.** `relation_list` and
  `component_relation_common` instance `sections` with a `related`-mode SQO and
  read `get_data()` to discover which records point at a source record.
- **Bulk delete.** The delete API action builds `sections::get_instance(null, null)`
  and calls `delete($options)` — the single chokepoint for permission checks,
  the multiple-delete guard, the children guard, and ontology coherence.

Use the singular **[`section`](section.md)** instead when you need one section
*type* — its components, permissions, JSON, or to create a record — and
**[`section_record`](section_record.md)** when you need to read, save or delete
one specific row. `sections` is the wrong tool for editing a single record: it
only locates and bulk-removes.

## Examples

### Get every `section_id` of a section_tipo and iterate

```php
$sqo = new search_query_object();
    $sqo->set_section_tipo([ 'oh1' ]);

$sections = sections::get_instance( null, $sqo, 'oh1', 'list', DEDALO_DATA_NOLAN );

// all matching ids, ignoring pagination
$ar_section_id = $sections->get_ar_all_section_id(); // e.g. [1, 2, 5, 9, ...]

foreach ($ar_section_id as $section_id) {
    $section_record = section_record::get_instance( 'oh1', (int)$section_id );
    // ... read / process the single record here ...
}
```

### Read the list result directly

```php
$sections  = sections::get_instance( null, $sqo, 'oh1', 'list', DEDALO_DATA_NOLAN );
$db_result = $sections->get_data();            // db_result | false

if ($db_result !== false) {
    foreach ($db_result as $record) {
        // each $record carries section_tipo + section_id
        $section_record = section_record::get_instance(
            $record->section_tipo,
            (int)$record->section_id
        );
    }
}
```

### Bulk delete a record

```php
$options = new stdClass();
    $options->delete_mode  = 'delete_record';   // or 'delete_data'
    $options->section_tipo = 'oh1';
    $options->section_id   = 57;                 // sqo built from this when no sqo passed

$sections = sections::get_instance( null, null ); // no scope needed; delete uses $options
$response = $sections->delete( $options );

// $response->result  → array of deleted section_id(s), or false/[] on failure
// $response->msg     → human-readable status
// $response->errors  → array of error strings (e.g. skipped-children)
```

## Related

- [Sections concept](index.md) — the matrix-table model and the section class family.
- [section](section.md) — the singular section type (table abstraction & orchestrator).
- [section_record](section_record.md) — physical per-record database I/O.
- [Components](../components/index.md) — the fields that live inside a section.
- [SQO](../sqo.md) — the Search Query Object machinery `sections` delegates every query to.
- [Locator](../locator.md) — the pointer type accepted in `$ar_locators` / filters.
