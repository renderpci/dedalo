# hierarchy

> The TS successor of the server class `hierarchy` — the helper that manages the **`hierarchy` TLD**: the master records that describe each thesaurus/taxonomy tree, the *virtual sections* their terms live in, and the high-speed configuration lookups (main language, section map) that the tree machinery depends on.

> See also: [Thesaurus & ontology tree](../thesaurus/index.md) · [Ontology](index.md) · [Sections](../sections/index.md) · [section_map resolver](../sections/section.md)

This page is the **module-level reference** for the TS `hierarchy` port. For the
*conceptual* model — what a thesaurus tree is, how a term stores its parent,
descriptors/ND, how the client tree renders — read
[Thesaurus & ontology tree](../thesaurus/index.md) first; this document does not
repeat that material at length. It focuses on the real TS modules, their real
exports and the data they own — and, honestly, on what PHP's `hierarchy` did
that has **no TS port yet**.

## Role

PHP's `hierarchy` (`core/hierarchy/class.hierarchy.php`,
`class hierarchy extends ontology`) was a **purely static** helper class: the
back-office machinery for the `hierarchy` TLD — the part of the ontology that
defines controlled vocabularies (toponymy, onomastic, thematic thesauri,
material/technique taxonomies, typology catalogues).

The TS rewrite does **not** have one module mirroring this class. Its three
jobs are covered by three separate, purpose-built modules, matching the
horizontal-engine split the rest of the rewrite uses — plus real gaps where
PHP's schema-diffing and export tooling have not been ported:

| job | PHP | TS |
| --- | --- | --- |
| **Describe trees** (read the `hierarchy1` master record) | `get_hierarchy_by_tld()`, `get_hierarchy_section()`, `get_typology_locator_from_tld()`, `get_hierarchy_name()`, `get_all_main_hierarchy_records()` | **No dedicated TS port** — the only master-record reads that exist are ad hoc, inlined at their call site (see below); there is no reusable "look up a hierarchy1 record" module. |
| **Materialise the term storage** (activate a hierarchy) | `generate_virtual_section()`, `get_default_section_tipo_term/model()` | `src/core/resolve/hierarchy_provision.ts` — `generateVirtualSection()` |
| **Serve fast lookups** (main language, section_map) | `get_main_lang()`, `get_section_map_elemets()`, `get_element_tipo_from_section_map()` | `src/core/ts_object/term_resolver.ts` (private `getMainLang()`) + `src/core/ontology/section_map.ts` (`getSectionMap()`, `getSectionMapValue()`) |
| **Root terms** | `create_thesaurus_general_term()`, `set_term_value()` | `src/core/resolve/hierarchy_provision.ts` — `createThesaurusGeneralTerm()`; `set_term_value()` has **no TS port** |
| **Schema diffing** | `get_simple_schema_of_sections()`, `build_simple_schema_changes()`, `save/list/parse_simple_schema_*` | **No TS port** (gap — an ontology-update-time tool) |
| **Export** | `export_hierarchy()` | **No TS port** — the developer tool explicitly refuses this action (`engineDenied`, `src/core/resolve/widget_request.ts`) |
| **Status sync** | `sync_hierarchy_active_status()` | `src/core/resolve/widget_request.ts` — `exportHierarchySyncActiveStatus()` |

!!! note "No inheritance chain to preserve"
    PHP's `hierarchy extends ontology` (sharing `ontology`'s statics and
    `clear()` chain) has no TS analog to preserve: TS modules are plain
    functions with no class hierarchy, and the caches each module owns
    register independently with the shared invalidation hub
    (`src/core/ontology/cache_invalidation.ts`) rather than chaining a
    `parent::clear()` call. See [Worker hygiene](#worker-hygiene-and-cache-invalidation).

## Responsibilities

- **Master records** — reading `hierarchy1` (`matrix_hierarchy_main`) by tld,
  or listing active hierarchies, has no single reusable TS function; each
  caller queries `matrix_hierarchy_main` directly for what it needs (e.g.
  `getMainLang()`'s TLD→lang lookup in `term_resolver.ts`, the active-hierarchy
  sweep in `exportHierarchySyncActiveStatus()`, the tree-boot projection in
  `area/tree.ts`).
- **Virtual sections** — `generateVirtualSection()`
  (`src/core/ontology/hierarchy_provision.ts`) generates the descriptor
  (`{tld}1`) and model (`{tld}2`) sections from a master record, wiring their
  `dd_ontology` nodes, parent groupers and the master record's target-section
  pointers, inside ONE transaction (rollback on any validation/write failure —
  a stronger guarantee than PHP's un-transacted sequence). **User-permission
  grants ARE written**: the creating user's profile is granted level `2` over
  the two new sections and every element inside them
  (`setSectionPermissions()`, `src/core/security/section_permissions.ts` — the
  port of PHP `component_security_access::set_section_permissions()`), or the
  hierarchy they just built would be invisible to them. A failed grant stays
  NON-FATAL, as in PHP: the error is collected in `response.errors` and
  provisioning is not rolled back.
- **Configuration lookups** — a thesaurus section's **main language**
  (`getMainLang()`, private to `term_resolver.ts`) and its **section_map**
  element tipos (`getSectionMap()` / `getSectionMapValue()`,
  `ontology/section_map.ts`), each with their own module-level cache.
- **Root terms** — `createThesaurusGeneralTerm()`
  (`hierarchy_provision.ts`) seeds the "General term" root a thesaurus shows at
  the top of a tree. **Does not** rename the new term after the hierarchy (PHP
  `set_term_value()`) — deferred/ledgered; the seed itself is what the tree
  needs to render.
- **Schema diffing** — **not ported**. PHP's section→children schema
  snapshot/diff/changelog tooling around ontology updates has no TS
  equivalent (gap).
- **Export** — **not ported**. The `\copy`-based MASTER toponymy export has no
  TS equivalent; the corresponding developer-tool action is explicitly
  refused.
- **Status sync** — `exportHierarchySyncActiveStatus()`
  (`src/core/resolve/widget_request.ts`) propagates "Active in thesaurus"
  (`hierarchy125`) to "Active" (`hierarchy4`), deactivating hierarchies not in
  the thesaurus (the 'People'/`rsc197` hierarchy exempted) — byte-parity gated
  against live PHP (`widget_request_differential.test.ts`).
- **Worker hygiene** — **structurally unnecessary** in the same shape PHP
  needed it: see [Worker hygiene](#worker-hygiene-and-cache-invalidation).

## Key concepts

### Master record vs virtual sections

A hierarchy lives in **two layers** — unchanged from PHP, since this is the
same `dd_ontology`/matrix schema:

| layer | where | what it holds |
| --- | --- | --- |
| **Master record** | section `hierarchy1`, table `matrix_hierarchy_main` | The definition of one tree: tld (`hierarchy6`), name (`hierarchy5`), main lang (`hierarchy8`), typology (`hierarchy9`), active flag (`hierarchy4`), source real section (`hierarchy109`), target sections (`hierarchy53` / `hierarchy58`) and the root-term portals (`hierarchy45` / `hierarchy59`). |
| **Term sections** | the *virtual* sections `{tld}1` (descriptors) and `{tld}2` (model) | The actual vocabulary records (`es1_5`, `es2_3`, …), each with its term value, descriptor/indexable flags and parent locator. |

The two layers are connected by `generateVirtualSection()`
(`src/core/resolve/hierarchy_provision.ts`): it reads the master record,
validates it (in PHP's exact validation order — active flag, tld, source real
section, typology, name), then creates the two virtual sections plus their
ontology nodes inside one transaction. The virtual sections **contain no
components of their own** — they inherit their entire definition from a real
section (`hierarchy20`) via the section virtual-resolution mechanism, exactly
as in PHP.

### The hierarchy tipos it depends on

The named tipo constants moved from PHP's `core/base/dd_tipos.php` `DEDALO_*`
defines to a single TS source of truth:
`src/core/ontology/ontology_tipos.ts`. The load-bearing ones (verified
present, same values):

| constant (TS) | tipo | meaning |
| --- | --- | --- |
| `HIERARCHY_MAIN_SECTION` | `hierarchy1` | the master section |
| `HIERARCHY_ACTIVE` | `hierarchy4` | "Active" si/no flag of the master record |
| `HIERARCHY_TERM` | `hierarchy5` | master record name |
| `HIERARCHY_TLD` | `hierarchy6` | the tld (e.g. `es`) that seeds the virtual-section tipos |
| `HIERARCHY_LANG` | `hierarchy8` | the tree's main language locator |
| `HIERARCHY_TYPOLOGY` | `hierarchy9` | typology (thematic / toponymy / …) |
| `HIERARCHY_TARGET_SECTION` | `hierarchy53` | the descriptor target section (`{tld}1`) |
| `HIERARCHY_TARGET_SECTION_MODEL` | `hierarchy58` | the model target section (`{tld}2`) |
| `HIERARCHY_GENERAL_TERM` | `hierarchy45` | "General term" root-term portal |
| `HIERARCHY_GENERAL_TERM_MODEL` | `hierarchy59` | "General term model" root-term portal |
| `HIERARCHY_SOURCE_REAL_SECTION` | `hierarchy109` | the real section the virtual sections inherit from |
| `HIERARCHY_ACTIVE_IN_THESAURUS` | `hierarchy125` | "Active in thesaurus" flag, swept by `exportHierarchySyncActiveStatus()` |

!!! note "Children are portals, not relation_children"
    Unchanged from PHP: the "General term" root is a `component_portal`
    (`hierarchy45`/`hierarchy59`), not a `component_relation_children`. TS's
    `createThesaurusGeneralTerm()` writes the portal link locator directly.

### Module-level state

There is no single class holding static config/caches; each module owns its
own:

| cache | module | purpose |
| --- | --- | --- |
| `mainLangCache` | `ts_object/term_resolver.ts` | `section_tipo → 'lg-xxx'` main-language cache (bounded only by the invalidation hub's full flush — no size cap). |
| `sectionMapCache` | `ontology/section_map.ts` | `section_tipo → section_map properties` cache. |
| `termByLocatorCache` | `ts_object/term_resolver.ts` | The resolved-term cache (bounded to 1000 entries; on overflow the **whole cache is dropped**, mirroring PHP's O(1) eviction rather than an LRU trim). |
| — (active-elements cache) | *(none)* | PHP's `$cache_hierarchy_elements` has no direct TS twin; the closest analog is the tree-boot projection in `src/core/area/tree.ts`, which is not itself cached beyond the request. |

## Instantiation & lifecycle

Nothing to instantiate — every entry point is a plain exported `async
function`. The "lifecycle" that matters is cache invalidation, which is
automatic (see below), not something you call:

```ts
import { generateVirtualSection, createThesaurusGeneralTerm } from
  'src/core/resolve/hierarchy_provision.ts';
import { getSectionMapValue } from 'src/core/ontology/section_map.ts';

// Activate a hierarchy: create its {tld}1/{tld}2 virtual sections.
const response = await generateVirtualSection({ section_id: 3, section_tipo: 'hierarchy1' });
// response = { result, msg, errors }

// Resolve the 'term' element tipo of a thesaurus section (scope chain
// main → thesaurus → relation_list).
const termTipo = await getSectionMapValue('es1', 'thesaurus', 'term');
```

### Worker hygiene and cache invalidation

PHP's `hierarchy::clear()` chained `parent::clear()` (the `ontology`/`common`
statics) then purged its own four caches, and had to be registered with the
persistent-worker cache manager (`worker/class.cache_manager.php`) so a
long-lived worker never carried one request's resolved main language, section
map or active-elements list into the next. TS achieves the same outcome
**structurally**: `mainLangCache` and `sectionMapCache`'s underlying
`dd_ontology`/`section_map` reads are content-keyed, and `mainLangCache`
registers its clear function with `clearOntologyDerivedCaches()`
(`src/core/ontology/cache_invalidation.ts`) — the single chokepoint every
`dd_ontology` write fans out to. `termByLocatorCache` registers too, **plus**
a targeted `invalidateNode()` eviction the tree calls directly after a
mutation (not just the ontology-write hook). `sectionMapCache` itself is
**not currently registered** with the hub (worth knowing — a section_map
edit's effect is only visible after a full process restart or an unrelated
full-flush, unless a future change registers it).

## Public API

Grouped by concern, matching the PHP grouping. A row with **no TS export**
listed is an honest gap, not an oversight in this doc.

### Master records & active hierarchies

| PHP | TS | module | purpose |
| --- | --- | --- | --- |
| `get_all_main_hierarchy_records()` | — | — | **Not ported** (gap). |
| `get_active_elements()` | tree-boot projection | `area/tree.ts` | Different shape (feeds the thesaurus/ontology tree area boot payload directly) rather than a reusable "list active elements" function; byte-parity gated (`area_hierarchy_differential.test.ts`). |
| `get_hierarchy_by_tld($tld)` | — | — | **Not ported** as a standalone lookup; `getMainLang()` inlines an equivalent TLD→`hierarchy1` jsonpath query for its own narrower purpose. |
| `get_hierarchy_section(...)` | — | — | **Not ported** (gap). |
| `get_typology_locator_from_tld($tld)` | — | — | **Not ported** as a general lookup; `ontology_write.ts`'s `createDdOntologyRootNode()` defaults an absent `typology_id` to `15` ("others") directly rather than resolving it from `matrix_hierarchy_main` (documented shortcut — every current caller already passes an explicit typology id). |
| `get_hierarchy_name(...)` | — | — | **Not ported** (gap). |

### Virtual section generation

| PHP | TS | module | purpose |
| --- | --- | --- | --- |
| `generate_virtual_section($options)` | `generateVirtualSection(options)` | `ontology/hierarchy_provision.ts` | Validates (active/tld/source-section/typology/name, PHP's exact order), then — inside **one transaction** — provisions the descriptor + model virtual sections, their `dd_ontology` nodes, parent groupers, and writes the master record's target-section pointers back. Grants the creating user's profile level `2` over both new sections (`setSectionPermissions()`); a failed grant is non-fatal, as in PHP. |
| `get_default_section_tipo_term($tld)` / `get_default_section_tipo_model($tld)` | *(inline)* `` `${tld}1` `` / `` `${tld}2` `` | `resolve/hierarchy_provision.ts` | Same string-concat rule, not exposed as named helpers. |

### Configuration lookups (the hot path)

| PHP | TS | module | purpose |
| --- | --- | --- | --- |
| `get_main_lang($section_tipo)` | `getMainLang(sectionTipo)` *(private)* | `ts_object/term_resolver.ts` | Fixed `'lg-eng'` for `lg1`; otherwise a `matrix_hierarchy_main` jsonpath lookup of `hierarchy6`→`hierarchy8`, converted to `lg-xxx` via the lang record's ISO code, with the same per-section fallback tail (`es1 → lg-spa`, `hierarchy1 → the configured data lang`, else `lg-eng`). **Not exported** — only reachable through `getTermByLocator()`/`getTermDataByLocator()`, which need it for the display-value fallback chain. |
| `get_section_map_elemets($section_tipo)` | `getSectionMap(sectionTipo)` | `ontology/section_map.ts` | Returns the `section_map` element's `properties`, resolving to the real section when a virtual one has none. Cached. |
| `get_element_tipo_from_section_map($section_tipo,$type,$scope)` | `getSectionMapValue(sectionTipo, scope, key)` | `ontology/section_map.ts` | Per-key scope-chain walk (`main → thesaurus → relation_list`, `SCOPE_FALLBACK`). |
| `get_all_tables($ar_section_tipo)` | — | — | **Not ported** (gap). |

### Root terms & term values

| PHP | TS | module | purpose |
| --- | --- | --- | --- |
| `create_thesaurus_general_term($section_tipo,$section_id,$general_term_tipo)` | `createThesaurusGeneralTerm(sectionTipo, sectionId, generalTermTipo)` | `resolve/hierarchy_provision.ts` | Seeds the "General term"/"General term model" portal root — only when not already present; resolves the target section from `hierarchy53`/`hierarchy58`, appends the link locator via the shared `applyAddNewElement()` relations helper. Returns `true` when it created an element. **Does not** rename the new term after the hierarchy (`set_term_value()`, deferred). |
| `set_term_value(...)` | — | — | **Not ported** (gap). |

### Schema diffing (ontology updates)

| PHP | TS |
| --- | --- |
| `get_simple_schema_of_sections()` / `build_simple_schema_changes()` / `save_simple_schema_file()` / `get_simple_schema_changes_files()` / `parse_simple_schema_changes_file()` | **None ported** (gap — an ontology-update-time snapshot/diff tool, not exercised by normal request handling). |

### Export & status

| PHP | TS | module | purpose |
| --- | --- | --- | --- |
| `export_hierarchy($section_tipo)` | — | `resolve/widget_request.ts` | **Refused, not ported.** The `export_hierarchy.export_hierarchy` developer-tool action is registered as `engineDenied(...)` — a deliberate boundary, not a missing wire-up. |
| `sync_hierarchy_active_status()` | `exportHierarchySyncActiveStatus()` | `resolve/widget_request.ts` | Deactivates every active hierarchy whose "active in thesaurus" flag is not yes (People/`rsc197` exempt), writing through the standard component save path (Time Machine row included). Byte-parity gated vs live PHP. |

### Lifecycle

| PHP | TS |
| --- | --- |
| `clear()` | No equivalent call exists or is needed — see [Worker hygiene](#worker-hygiene-and-cache-invalidation). |

## How it fits with the rest of Dédalo

The modules on this page are the *definition/config* layer for thesaurus
trees; the rendering, mutation and resolution layers sit around them:

- **[Thesaurus & ontology tree](../thesaurus/index.md)** — the conceptual
  model and the runtime tree (`ts_object`, `area_thesaurus`/`area_ontology`,
  `dd_ts_api`). The tree calls `getMainLang()`/`getSectionMap()` constantly;
  it builds nodes from the virtual sections `generateVirtualSection()`
  created. **These modules define the tree; `ts_object` draws it.**
- **[Sections](../sections/index.md)** — the descriptor/model sections
  (`es1`, `es2`, …) are **virtual sections** resolved by the section engine;
  their term records are ordinary section records.
  `generateVirtualSection()` uses `createSectionRecord()`
  (`src/core/section/record/create_record.ts`) to create them.
- **`section_map`** — `getSectionMapValue()` / `getSectionMap()`
  (`ontology/section_map.ts`) resolve term/children-tipo resolution with the
  scope chain `main → thesaurus → relation_list`; see the
  [section_map resolver](../sections/section.md) page.
- **[Ontology](index.md)** — `hierarchy_provision.ts` calls into the write
  layer's `addMainSection()`, `createDdOntologyRootNode()`,
  `createParentGrouper()` and `insertDdOntologyRecord()`
  (`ontology/ontology_write.ts`) when materialising virtual sections.
- **Components** — terms are read/written through the same matrix
  read/write primitives as any other component data:
  `component_relation_parent` (`hierarchy36` / `dd47`) stores a term's parent,
  and the root "General term" is a `component_portal`
  (`hierarchy45`/`hierarchy59`). See
  [component_relation_parent](../components/component_relation_parent.md),
  [component_relation_children](../components/component_relation_children.md),
  [component_portal](../components/component_portal.md).
- **Term resolution** — display values for a term locator are resolved by
  `getTermByLocator()`/`getTermDataByLocator()` (`ts_object/term_resolver.ts`),
  not by anything on this page.

## Examples

### Resolve a thesaurus section's working language and a term

```ts
import { getTermByLocator } from 'src/core/ts_object/term_resolver.ts';

// getMainLang() itself is private — reached only through the term resolver,
// which falls back to it when the requested language has no value.
const label = await getTermByLocator({ section_tipo: 'es1', section_id: 42 }, 'lg-eng');
```

### Resolve the section_map's 'term' element tipo

```ts
import { getSectionMapValue } from 'src/core/ontology/section_map.ts';

const termTipo = await getSectionMapValue('es1', 'thesaurus', 'term'); // e.g. 'es16'
```

### Generate the virtual sections for an active hierarchy

```ts
import { generateVirtualSection } from 'src/core/resolve/hierarchy_provision.ts';

// options point at the master (hierarchy1) record
const response = await generateVirtualSection({ section_id: 3, section_tipo: 'hierarchy1' });
// response.result is false (with response.errors) if the master record is
// not active, or is missing its tld / source real section / typology / name.
// On success it has created e.g. es1 and es2 plus their dd_ontology nodes —
// all inside one transaction: any failure mid-sequence rolls the whole thing
// back (a stronger guarantee than PHP's un-transacted sequence).
```

!!! warning "generate_virtual_section is a heavy, ordered mutation"
    It creates ontology nodes, two section records and parent groupers, and
    writes `dd_ontology` — all inside one transaction. Treat it as a one-shot
    activation action (it is what the *create hierarchy* button triggers),
    not a per-request helper. It validates the whole master record **before**
    writing anything, in PHP's exact validation order.

## Related

- [Thesaurus & ontology tree](../thesaurus/index.md) — the conceptual tree, its
  storage model and the `ts_object` runtime/client.
- [Ontology](index.md) — the active schema and the `ontology` write/compile
  layer `hierarchy_provision.ts` calls into.
- [Sections](../sections/index.md) · [section.md](../sections/section.md) — the
  virtual-section mechanism and the `section_map` resolver.
- [component_relation_parent](../components/component_relation_parent.md) ·
  [component_relation_children](../components/component_relation_children.md) ·
  [component_portal](../components/component_portal.md) — the components that
  store a term's parent, compute its children and hold the root term.
- [Locator](../locator.md) — the pointer type used for parent / root-term links.
- [Architecture overview](../architecture_overview.md) — where the `hierarchy`
  TLD sits in the matrix/ontology model.
