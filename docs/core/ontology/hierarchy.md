# hierarchy

> The server class `hierarchy` — the static helper that manages the **`hierarchy` TLD**: the master records that describe each thesaurus/taxonomy tree, the *virtual sections* their terms live in, and the high-speed configuration lookups (main language, section map) that the tree machinery depends on.

> See also: [Thesaurus & ontology tree](../thesaurus/index.md) · [Ontology](index.md) · [Sections](../sections/index.md) · [section_map resolver](../sections/section.md)

This page is the **class-level reference** for `hierarchy`. For the *conceptual*
model — what a thesaurus tree is, how a term stores its parent, descriptors/ND,
how the client tree renders — read [Thesaurus & ontology tree](../thesaurus/index.md)
first; this document does not repeat that material at length. It focuses on the
PHP class, its real methods and the data it owns.

## Role

`hierarchy` (in `core/hierarchy/class.hierarchy.php`, `class hierarchy extends ontology`)
is a **purely static** helper class. It is the back-office machinery for the
`hierarchy` TLD — the part of the ontology that defines controlled vocabularies
(toponymy, onomastic, thematic thesauri, material/technique taxonomies, typology
catalogues). It owns no instance state and has **no `get_instance()` and no
constructor**; you call its methods statically (`hierarchy::get_main_lang(...)`,
`hierarchy::get_active_elements()`, …).

Its three jobs:

1. **Describe trees.** Each tree is a record of the master section `hierarchy1`
   (`DEDALO_HIERARCHY_SECTION_TIPO`), stored in the dedicated table
   `matrix_hierarchy_main`. That record carries the tree's TLD, typology, main
   language, active state, target sections and root-term portals.
2. **Materialise the term storage.** A hierarchy is *activated* by generating two
   **virtual sections** — the descriptors section (`{tld}1`, e.g. `es1`) and the
   model/typology section (`{tld}2`, e.g. `es2`) — whose term records actually
   hold the vocabulary. `generate_virtual_section()` is the orchestrator for this.
3. **Serve fast lookups.** The tree builder ([ts_object](../thesaurus/index.md)),
   portals, autocompletes and diffusion constantly need a section's main language
   and its `section_map` element tipos. `hierarchy` answers these with direct,
   cached SQL/ontology reads rather than full object instancing.

!!! note "Inheritance"
    `hierarchy extends ontology`. `ontology` (`core/ontology/class.ontology.php`)
    is itself a static utility class for reading and mutating the active schema
    (`add_main_section()`, `create_dd_ontology_ontology_section_node()`,
    `create_parent_grouper()`, `insert_dd_ontology_record()`, `row_to_element()`,
    `get_all_main_ontology_records()`). `hierarchy` reuses those when it builds the
    virtual sections and the `dd_ontology` nodes. Both classes ultimately share the
    [common](../../) caching/clear() machinery through the wider class graph; the
    relevant fact here is that `hierarchy::clear()` chains `parent::clear()` and
    then purges its own static caches (see [Worker hygiene](#worker-hygiene-and-clear)).

## Responsibilities

- **Master records** — read the `hierarchy1` master table (`matrix_hierarchy_main`)
  by tld, list every record, and list the currently *active* hierarchies.
- **Virtual sections** — generate the descriptor (`{tld}1`) and model (`{tld}2`)
  sections from a master record, wiring their `dd_ontology` nodes, permissions,
  parent groupers and the master record's target-section pointers.
- **Configuration lookups** — resolve a thesaurus section's **main language**
  and its **section_map element tipos** (term, children, …), with static caches.
- **Root terms** — create the "General term" root the thesaurus shows at the top
  of a tree (`create_thesaurus_general_term()`), and read/write a term's value.
- **Schema diffing** — snapshot the ontology's section→children schema, compute
  the changes between two snapshots, and persist/parse change files (used around
  ontology updates).
- **Export** — dump hierarchy matrix tables to `\copy` files for the MASTER
  toponymy export.
- **Status sync** — propagate "Active in thesaurus" to the "Active" flag.
- **Worker hygiene** — keep all its statics in `clear()` so nothing bleeds across
  persistent-worker requests.

## Key concepts

### Master record vs virtual sections

A hierarchy lives in **two layers**:

| layer | where | what it holds |
| --- | --- | --- |
| **Master record** | section `hierarchy1`, table `matrix_hierarchy_main` | The definition of one tree: tld (`hierarchy6`), name (`hierarchy5`), main lang (`hierarchy8`), typology (`hierarchy9`), active flag (`hierarchy4`), source real section (`hierarchy109`), target sections (`hierarchy53` / `hierarchy58`) and the root-term portals (`hierarchy45` / `hierarchy59`). |
| **Term sections** | the *virtual* sections `{tld}1` (descriptors) and `{tld}2` (model) | The actual vocabulary records (`es1_5`, `es2_3`, …), each with its term value, descriptor/indexable flags and parent locator. |

The two layers are connected by `generate_virtual_section()`: it reads the master
record, validates it, and creates the two virtual sections plus their ontology
nodes. The virtual sections **contain no components of their own** — they inherit
their entire definition from a real section (`hierarchy20`,
`DEDALO_THESAURUS_SECTION_TIPO`) via the `section` virtual-resolution mechanism.

### The hierarchy tipos it depends on

`hierarchy` is hard-wired to a set of `hierarchy*` (and core `dd*`) tipos defined
in `core/base/dd_tipos.php`. The load-bearing ones:

| constant | tipo | meaning |
| --- | --- | --- |
| `DEDALO_HIERARCHY_SECTION_TIPO` | `hierarchy1` | the master section (also `hierarchy::$main_section_tipo`) |
| `DEDALO_HIERARCHY_ACTIVE_TIPO` | `hierarchy4` | "Active" si/no flag of the master record |
| `DEDALO_HIERARCHY_TERM_TIPO` | `hierarchy5` | master record name |
| `DEDALO_HIERARCHY_TLD2_TIPO` | `hierarchy6` | the tld (e.g. `es`) that seeds the virtual-section tipos |
| `DEDALO_HIERARCHY_LANG_TIPO` | `hierarchy8` | the tree's main language locator |
| `DEDALO_HIERARCHY_TYPOLOGY_TIPO` | `hierarchy9` | typology (thematic / toponymy / …) |
| `DEDALO_HIERARCHY_TARGET_SECTION_TIPO` | `hierarchy53` | the descriptor target section (`{tld}1`) |
| `DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO` | `hierarchy58` | the model target section (`{tld}2`) |
| `DEDALO_HIERARCHY_CHILDREN_TIPO` | `hierarchy45` | "General term" root-term portal |
| `DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO` | `hierarchy59` | "General term model" root-term portal |
| `DEDALO_HIERARCHY_SOURCE_REAL_SECTION_TIPO` | `hierarchy109` | the real section the virtual sections inherit from |

!!! note "Children are portals now, not relation_children"
    `hierarchy::$hierarchy_portals_tipo = [DEDALO_HIERARCHY_CHILDREN_TIPO, DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO]`.
    The class docblock and `create_thesaurus_general_term()` both note that the
    "General term" root used to be a `component_relation_children` and is now a
    `component_portal`.

### Class variables / state

`hierarchy` holds only static configuration and caches:

| static | type | purpose |
| --- | --- | --- |
| `$main_table` | `string` (`'matrix_hierarchy_main'`) | the master records table |
| `$main_section_tipo` | `string` (`'hierarchy1'`) | the master section tipo |
| `$hierarchy_portals_tipo` | `array` | the two root-term portal tipos |
| `$cache_main_lang` | `array` | `section_tipo → 'lg-xxx'` main-language cache |
| `$cache_section_map_elemets` | `array` | `section_tipo → section_map properties` cache |
| `$cache_hierarchy_section` | `array` | resolved master `section_id` cache, keyed by `[section_tipo][component_tipo]` |
| `$cache_hierarchy_elements` | `array` | the cached `get_active_elements()` result |

All caches are bounded with the inherited `common::manage_cache_size()` and reset
in `clear()`.

## Instantiation & lifecycle

There is nothing to instantiate. `hierarchy` is a **static-only** class (no
`__construct()`, no `get_instance()`); every entry point is a static method. The
"lifecycle" that matters is cache management across worker requests.

```php
// Resolve the working language of a thesaurus section (cached, direct SQL).
$main_lang = hierarchy::get_main_lang('es1'); // e.g. 'lg-spa'

// List the currently active hierarchies (cached).
$active = hierarchy::get_active_elements();
//   each item is an ontology::row_to_element() object with fields like
//   section_id, section_tipo, target_section_tipo, active_in_thesaurus, …

// Look up the master record for a TLD.
$row = hierarchy::get_hierarchy_by_tld('es'); // { section_id, section_tipo:'hierarchy1' } | null
```

### Worker hygiene and clear()

```php
public static function clear() : void {
    parent::clear();                          // ontology + common statics
    self::$cache_main_lang            = [];
    self::$cache_section_map_elemets  = [];
    self::$cache_hierarchy_section    = [];
    self::$cache_hierarchy_elements   = [];
}
```

`clear()` is the persistent-worker reset hook. It is registered with the worker
cache manager (`worker/class.cache_manager.php`) alongside `ts_object::clear()`,
so a long-lived Bun/persistent worker never carries one request's resolved main
language, section map or active-elements list into the next request. Because
these caches are **not** user-scoped, leaving them out of `clear()` would be a
state-bleed bug.

## Public API

All methods are **static**. Grouped by concern. Names are verified against
`core/hierarchy/class.hierarchy.php`.

### Master records & active hierarchies

| method | static? | purpose |
| --- | --- | --- |
| `get_all_main_hierarchy_records()` | ✓ | Search the master section (`hierarchy1`) with no limit and `skip_projects_filter`, returning every master record (`fetch_all()`). Alias of `ontology::get_all_main_ontology_records` in spirit. |
| `get_active_elements()` | ✓ | Run a real SQL search for master records whose "Active" (`hierarchy4`) flag is *yes*, map each row through `ontology::row_to_element()`, and cache the array. Each element carries `section_id`, `section_tipo`, `target_section_tipo`, `active_in_thesaurus`, … |
| `get_hierarchy_by_tld($tld)` | ✓ | Direct `matrix_hierarchy_main` SQL (jsonpath on the tld component, `safe_tld()`-sanitised) returning `{ section_id, section_tipo }` or `null`. |
| `get_hierarchy_section($section_tipo, $hierarchy_component_tipo)` | ✓ | SQO search of `hierarchy1` for the master `section_id` whose given component points at `$section_tipo`; cached. |
| `get_typology_locator_from_tld($tld)` | ✓ | Resolve a tld's master record and return its typology (`hierarchy9`) locator, or `null`. |
| `get_hierarchy_name($section_tipo, $section_id)` | ✓ | Read the master record's name (`hierarchy5`) value. |

### Virtual section generation

| method | static? | purpose |
| --- | --- | --- |
| `generate_virtual_section($options)` | ✓ | The big orchestrator: from a master record (`{section_id, section_tipo}`) validate active flag / tld / source real section / typology / name, then create the descriptor (`{tld}1`) and model (`{tld}2`) virtual sections — their `dd_ontology` main node, two section records, parent groupers, permissions for the current user, and the master record's target-section pointers. Returns `{result, msg, errors}`. |
| `get_default_section_tipo_term($tld)` | ✓ | `strtolower($tld).'1'` — the descriptor section tipo (e.g. `'es' → 'es1'`). |
| `get_default_section_tipo_model($tld)` | ✓ | `strtolower($tld).'2'` — the model section tipo (e.g. `'es' → 'es2'`). |

### Configuration lookups (the hot path)

| method | static? | purpose |
| --- | --- | --- |
| `get_main_lang($section_tipo)` | ✓ | The tree's working language. Fixed `'lg-eng'` for `lg1`; otherwise a direct `matrix_hierarchy_main` jsonpath lookup of `hierarchy8`, with per-section fallbacks (`es1 → lg-spa`, master `hierarchy1 → DEDALO_DATA_LANG_DEFAULT`, else `lg-eng`). Cached. **Speed-critical** — called for every thesaurus section. |
| `get_section_map_elemets($section_tipo)` | ✓ | Return the `section_map` element's `properties` (as array) for a section, resolving to the real section when the virtual one has none. Cached. |
| `get_element_tipo_from_section_map($section_tipo, $type, $scope=null)` | ✓ | Resolve a single element tipo (e.g. `'term'`, children) from the section map. **Delegates to `section_map::get_first_element_tipo()`**, which walks the scope fallback chain `main → thesaurus → relation_list`. |
| `get_all_tables($ar_section_tipo)` | ✓ | The set of distinct matrix tables backing a list of section tipos (via `common::get_matrix_table_from_tipo`). |

### Root terms & term values

| method | static? | purpose |
| --- | --- | --- |
| `create_thesaurus_general_term($section_tipo, $section_id, $general_term_tipo)` | ✓ | Create the root "General term" record shown at the top of a thesaurus and link it into the `hierarchy45`/`hierarchy59` portal — only if not already present. Sets the new record's term to the hierarchy name. Returns `bool`. (`$general_term_tipo` must be `'hierarchy45'` or `'hierarchy59'`.) |
| `set_term_value($section_tipo, $section_id, $name)` | ✓ | Write a term's value, resolving the term component tipo via the section map (`'term'`, scope `'thesaurus'`). Returns `bool`. |

### Schema diffing (ontology updates)

| method | static? | purpose |
| --- | --- | --- |
| `get_simple_schema_of_sections()` | ✓ | Snapshot every section → its recursive children as a flat associative array `["oh1" => ["oh17","oh25"], …]`. |
| `build_simple_schema_changes($old_schema, $new_schema)` | ✓ | Diff two snapshots, returning per-section `{tipo, children_added}` objects (only added children). |
| `save_simple_schema_file($options)` | ✓ | Compute the changes against a supplied old snapshot and write them as a JSON file under the ontology backup `changes/` dir. Returns `{result, msg, filepath}`. |
| `get_simple_schema_changes_files()` | ✓ | List the change-file names (newest first). |
| `parse_simple_schema_changes_file($filename)` | ✓ | Read a change file (path-traversal sanitised) and resolve each tipo to `{section, parents, children}` with labels. |

### Export & status

| method | static? | purpose |
| --- | --- | --- |
| `export_hierarchy($section_tipo)` | ✓ | MASTER toponymy export: `psql \copy` the matrix rows of one or more hierarchy sections (`'*'` = active hierarchies' target sections, `'all'`, or a comma-separated list) into gzipped `.copy` files under `EXPORT_HIERARCHY_PATH`. Returns `{result, msg}` with download links. |
| `sync_hierarchy_active_status()` | ✓ | Propagate each active hierarchy's "Active in thesaurus" to its "Active" (`hierarchy4`) flag, deactivating those not in the thesaurus (skipping `rsc197` People). Returns `bool`. |

### Lifecycle

| method | static? | purpose |
| --- | --- | --- |
| `clear()` | ✓ | Chain `parent::clear()` then purge the four hierarchy caches. The worker reset hook. |

## How it fits with the rest of Dédalo

`hierarchy` is the *definition/config* layer for thesaurus trees; the rendering,
mutation and resolution layers sit around it:

- **[Thesaurus & ontology tree](../thesaurus/index.md)** — the conceptual model
  and the runtime tree (`ts_object`, `area_thesaurus`/`area_ontology`,
  `dd_ts_api`). The tree calls `hierarchy::get_main_lang()` and the section_map
  helpers constantly; it builds nodes from the virtual sections `hierarchy`
  generated. **`hierarchy` defines the tree; `ts_object` draws it.**
- **[Sections](../sections/index.md)** — the descriptor/model sections
  (`es1`, `es2`, …) are **virtual sections** resolved by `section`; their term
  records are ordinary section records. `generate_virtual_section()` uses
  `section::get_instance()` / `section_record::get_instance()` to create them.
- **`section_map`** — `get_element_tipo_from_section_map()` /
  `get_section_map_elemets()` delegate term/children-tipo resolution to the
  `section_map` resolver (scope chain `main → thesaurus → relation_list`); see the
  [section_map resolver](../sections/section.md) and the section_map memory note.
- **[Ontology](index.md)** — the parent class; `hierarchy` reuses
  `ontology::add_main_section()`, `create_dd_ontology_ontology_section_node()`,
  `create_parent_grouper()`, `insert_dd_ontology_record()` and `row_to_element()`
  when materialising sections and when listing active elements.
- **Components** — terms are read/written through ordinary component instances:
  `component_relation_parent` (`hierarchy36` / `dd47`) stores a term's parent,
  `component_relation_children` computes children, and the root "General term" is
  a `component_portal` (`hierarchy45`/`hierarchy59`). See
  [component_relation_parent](../components/component_relation_parent.md),
  [component_relation_children](../components/component_relation_children.md),
  [component_portal](../components/component_portal.md).
- **Term resolution** — display values for a term locator are resolved by
  `ts_object` / `ts_term_resolver` (`get_term_by_locator`), not by `hierarchy`
  itself.

## Examples

### Resolve a thesaurus section's working language

```php
// the tree builder needs the right lang before reading term values
$lang = hierarchy::get_main_lang('es1');   // 'lg-spa' (cached after first call)

$model = ontology_node::get_model_by_tipo('hierarchy25', true);
$term  = component_common::get_instance(
    $model, 'hierarchy25', 42, 'list', $lang, 'es1'
);
$value = $term->get_value();
```

### List active hierarchies and find one by TLD

```php
$active = hierarchy::get_active_elements();
foreach ($active as $el) {
    // $el is an ontology::row_to_element() object
    if ($el->active_in_thesaurus) {
        // $el->section_tipo (hierarchy1), $el->section_id, $el->target_section_tipo
    }
}

$row = hierarchy::get_hierarchy_by_tld('es'); // { section_id: 66, section_tipo: 'hierarchy1' } | null
```

### Generate the virtual sections for an active hierarchy

```php
// $options points at the master (hierarchy1) record
$response = hierarchy::generate_virtual_section((object)[
    'section_id'   => 3,
    'section_tipo' => 'hierarchy1'
]);
// $response->result is false (with $response->errors) if the master record is
// not active, or is missing its tld / source real section / typology / name.
// On success it has created e.g. es1 and es2 plus their dd_ontology nodes.
```

!!! warning "generate_virtual_section is a heavy, ordered mutation"
    It creates ontology nodes, two section records, parent groupers and
    permissions, and writes `dd_ontology`. Treat it as a one-shot activation
    action (it is what the *create hierarchy* button triggers), not a per-request
    helper. It validates the whole master record **before** creating anything.

## Related

- [Thesaurus & ontology tree](../thesaurus/index.md) — the conceptual tree, its
  storage model and the `ts_object` runtime/client.
- [Ontology](index.md) — the active schema and the `ontology` parent class.
- [Sections](../sections/index.md) · [section.md](../sections/section.md) — the
  virtual-section mechanism and the `section_map` resolver.
- [component_relation_parent](../components/component_relation_parent.md) ·
  [component_relation_children](../components/component_relation_children.md) ·
  [component_portal](../components/component_portal.md) — the components that
  store a term's parent, compute its children and hold the root term.
- [Locator](../locator.md) — the pointer type used for parent / root-term links.
- [Architecture overview](../architecture_overview.md) — where the `hierarchy`
  TLD sits in the matrix/ontology model.
